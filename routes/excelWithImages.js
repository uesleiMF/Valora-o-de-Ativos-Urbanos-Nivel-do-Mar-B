import express from "express";
import ExcelJS from "exceljs";
import fs from "fs/promises";
import path from "path";
import axios from "axios";
import Imovel from "../models/Imovel.js";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Função para carregar imagens
async function fetchImageBuffer(source) {
  if (!source) return null;

  if (/^https?:\/\//i.test(source)) {
    try {
      const response = await axios.get(source, { responseType: "arraybuffer", timeout: 15000 });
      const contentType = response.headers["content-type"] || "image/png";
      let ext = "png";
      if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpeg";
      return { buffer: Buffer.from(response.data), ext };
    } catch (err) {
      console.warn("Erro imagem remota:", source);
      return null;
    }
  }

  try {
    let localPath = path.join(process.cwd(), "uploads", path.basename(source));
    if (source.includes("uploads")) localPath = path.join(process.cwd(), source);
    const buffer = await fs.readFile(localPath);
    const ext = path.extname(localPath).slice(1).toLowerCase() === "jpg" ? "jpeg" : path.extname(localPath).slice(1) || "png";
    return { buffer, ext };
  } catch (err) {
    console.warn("Erro imagem local:", source);
    return null;
  }
}

router.get("/", async (req, res) => {
  try {
    const imoveis = await Imovel.find().lean();

    if (imoveis.length === 0) {
      return res.status(404).json({ error: "Nenhum imóvel cadastrado." });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Valora Ativos Urbanos";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Imóveis");

    // TÍTULO
    sheet.mergeCells("A1:H2");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "Relatório de Imóveis – Risco de Elevação do Nível do Mar";
    titleCell.font = { size: 20, bold: true };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 60;

    // DATA E HORÁRIO DE BRASÍLIA
    sheet.mergeCells("A3:H3");
    const dateCell = sheet.getCell("A3");
    const brasiliaTime = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    dateCell.value = `Gerado em: ${brasiliaTime}`;
    dateCell.font = { size: 12, italic: true };
    dateCell.alignment = { horizontal: "center" };

    // RESUMO DE RISCOS COM PORCENTAGEM
    const riscoCount = { Baixo: 0, Médio: 0, Alto: 0 };
    imoveis.forEach((item) => {
      const risco = item.risco || "Baixo";
      if (riscoCount[risco] !== undefined) riscoCount[risco]++;
    });

    sheet.mergeCells("A5:C5");
    sheet.getCell("A5").value = "Distribuição por Nível de Risco";
    sheet.getCell("A5").font = { bold: true, size: 14 };

    sheet.getCell("A6").value = "Risco";
    sheet.getCell("B6").value = "Quantidade";
    sheet.getCell("C6").value = "Porcentagem";
    sheet.getRow(6).font = { bold: true };

    let resumoRow = 7;
    ["Baixo", "Médio", "Alto"].forEach((risco) => {
      const qtd = riscoCount[risco];
      const percent = imoveis.length > 0 ? (qtd / imoveis.length) * 100 : 0;
      if (qtd > 0) {
        sheet.getCell(`A${resumoRow}`).value = risco;
        sheet.getCell(`B${resumoRow}`).value = qtd;
        sheet.getCell(`C${resumoRow}`).value = percent / 100;
        sheet.getCell(`C${resumoRow}`).numFmt = "0.00%";
        resumoRow++;
      }
    });

    sheet.getCell(`A${resumoRow}`).value = "Total";
    sheet.getCell(`B${resumoRow}`).value = imoveis.length;
    sheet.getCell(`B${resumoRow}`).font = { bold: true };

    // TABELA PRINCIPAL
    const tableStartRow = resumoRow + 3;

    sheet.getRow(tableStartRow).values = [
      "Foto",
      "Título",
      "Endereço",
      "Latitude",
      "Longitude",
      "Nível do Mar (cm)",
      "Valor Atual (R$)",
      "Link de Localização",
    ];
    const headerRow = sheet.getRow(tableStartRow);
    headerRow.font = { bold: true };
    headerRow.height = 40;
    headerRow.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    sheet.columns = [
      { width: 18 },
      { width: 35 },
      { width: 45 },
      { width: 15 },
      { width: 15 },
      { width: 18 },
      { width: 22 },
      { width: 40 },
    ];

    const imagePromises = [];

    imoveis.forEach((item, index) => {
      const rowIndex = tableStartRow + 1 + index;
      const row = sheet.getRow(rowIndex);

      const valor = Number(item.valorAtual) || 0;

      row.values = [
        "",
        item.titulo || "",
        item.endereco || "",
        item.latitude ?? "",
        item.longitude ?? "",
        item.nivelDoMar ?? "",
        valor,
        item.linkLocalizacao ||
          (item.latitude && item.longitude
            ? `https://www.google.com/maps?q=${item.latitude},${item.longitude}`
            : ""),
      ];

      row.height = 90;
      row.alignment = { vertical: "middle", wrapText: true };

      // FORMATO DE MOEDA BRASILEIRO (funciona bem no Microsoft Excel)
      const valorCell = sheet.getCell(`G${rowIndex}`);
      valorCell.value = valor;
      valorCell.numFmt = '"R$ "#.##0,00;[Red]"R$ "-#.##0,00';
      valorCell.alignment = { horizontal: "right" };

      // Inserção de imagem
      if (item.imagem) {
        const promise = fetchImageBuffer(item.imagem).then((imgData) => {
          if (imgData) {
            const imageId = workbook.addImage({
              buffer: imgData.buffer,
              extension: imgData.ext,
            });
            sheet.addImage(imageId, {
              tl: { col: 0.2, row: rowIndex - 1 },
              ext: { width: 120, height: 80 },
              editAs: "oneCell",
            });
          }
        });
        imagePromises.push(promise);
      }
    });

    await Promise.all(imagePromises);

    // Bordas
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber >= tableStartRow) {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFD0D0D0" } },
            left: { style: "thin", color: { argb: "FFD0D0D0" } },
            bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
            right: { style: "thin", color: { argb: "FFD0D0D0" } },
          };
        });
      }
    });

    // CABEÇALHOS PARA ABRIR DIRETO NO EXCEL
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename*=UTF-8''relatorio_imoveis_com_fotos.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Erro ao gerar Excel:", err);
    res.status(500).json({ error: "Erro ao gerar relatório." });
  }
});

export default router;