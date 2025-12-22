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

// Função para carregar imagens (local ou remota)
async function fetchImageBuffer(source) {
  if (!source) return null;

  // Imagem remota (URL)
  if (/^https?:\/\//i.test(source)) {
    try {
      const response = await axios.get(source, { responseType: "arraybuffer", timeout: 15000 });
      const contentType = response.headers["content-type"] || "image/png";
      let ext = "png";
      if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpeg";
      return { buffer: Buffer.from(response.data), ext };
    } catch (err) {
      console.warn("Erro ao carregar imagem remota:", source);
      return null;
    }
  }

  // Imagem local (uploads)
  try {
    let localPath = path.join(process.cwd(), "uploads", path.basename(source));
    if (source.includes("uploads/")) {
      localPath = path.join(process.cwd(), source.replace(/^\//, ""));
    }
    const buffer = await fs.readFile(localPath);
    const ext = path.extname(localPath).slice(1).toLowerCase() === "jpg" ? "jpeg" : path.extname(localPath).slice(1) || "png";
    return { buffer, ext };
  } catch (err) {
    console.warn("Erro ao ler imagem local:", source);
    return null;
  }
}

// ROTA /api/excel
router.get("/", async (req, res) => {
  try {
    const imoveis = await Imovel.find().lean();

    if (imoveis.length === 0) {
      return res.status(404).json({ error: "Nenhum imóvel cadastrado." });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Valora Ativos Urbanos";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Relatório");

    // === TÍTULO PRINCIPAL ===
    sheet.mergeCells("A1:H3");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "Relatório de Imóveis – Risco de Elevação do Nível do Mar";
    titleCell.font = { size: 20, bold: true, color: { argb: "FF1565C0" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 60;

    // === DATA E HORA DE GERAÇÃO ===
    sheet.mergeCells("A4:H4");
    const dateCell = sheet.getCell("A4");
    dateCell.value = `Gerado em: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    dateCell.font = { size: 12, italic: true };
    dateCell.alignment = { horizontal: "center" };

    // === RESUMO DE RISCOS ===
    const riscoCount = { Baixo: 0, Médio: 0, Alto: 0 };
    imoveis.forEach((item) => {
      const risco = item.risco || "Baixo";
      if (riscoCount[risco] !== undefined) riscoCount[risco]++;
    });

    sheet.mergeCells("A6:C6");
    sheet.getCell("A6").value = "Distribuição por Nível de Risco";
    sheet.getCell("A6").font = { bold: true, size: 14, color: { argb: "FF1565C0" } };
    sheet.getCell("A6").alignment = { horizontal: "center" };

    // Cabeçalho do resumo
    sheet.getCell("A8").value = "Nível de Risco";
    sheet.getCell("B8").value = "Quantidade";
    sheet.getCell("C8").value = "Porcentagem";
    sheet.getRow(8).font = { bold: true };
    sheet.getRow(8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };

    // Dados do resumo
    let rowResumo = 9;
    ["Baixo", "Médio", "Alto"].forEach((risco) => {
      const qtd = riscoCount[risco];
      if (qtd > 0) {
        sheet.getCell(`A${rowResumo}`).value = risco;
        sheet.getCell(`B${rowResumo}`).value = qtd;
        sheet.getCell(`C${rowResumo}`).value = { formula: `=B${rowResumo}/${imoveis.length}`, numFmt: "0.00%" };
        rowResumo++;
      }
    });

    // Total
    sheet.getCell(`A${rowResumo}`).value = "Total de Imóveis";
    sheet.getCell(`B${rowResumo}`).value = imoveis.length;
    sheet.getCell(`B${rowResumo}`).font = { bold: true };

    // === TABELA PRINCIPAL ===
    const tableStartRow = rowResumo + 3; // espaço entre resumo e tabela

    sheet.columns = [
      { header: "Foto", key: "foto", width: 18 },
      { header: "Título", key: "titulo", width: 35 },
      { header: "Endereço", key: "endereco", width: 45 },
      { header: "Latitude", key: "latitude", width: 15 },
      { header: "Longitude", key: "longitude", width: 15 },
      { header: "Nível do Mar (m)", key: "nivelDoMar", width: 18 },
      { header: "Valor Atual (R$)", key: "valorAtual", width: 22 },
      { header: "Link de Localização", key: "linkLocalizacao", width: 40 },
    ];

    // Cabeçalho da tabela
    const headerRow = sheet.getRow(tableStartRow);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1565C0" } };
    headerRow.height = 40;
    headerRow.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    // Adicionar dados
    imoveis.forEach((item) => {
      sheet.addRow({
        foto: "",
        titulo: item.titulo || "",
        endereco: item.endereco || "",
        latitude: item.latitude ?? "",
        longitude: item.longitude ?? "",
        nivelDoMar: item.nivelDoMar ?? "",
        valorAtual: Number(item.valorAtual) || 0,
        linkLocalizacao:
          item.linkLocalizacao ||
          (item.latitude && item.longitude
            ? `https://www.google.com/maps?q=${item.latitude},${item.longitude}`
            : ""),
      });
    });

    // Formatação da moeda brasileira
    sheet.getColumn("valorAtual").numFmt = '_-"R$ "* #.##0,00;-"R$ "* #.##0,00';

    // Estilo das linhas de dados
    for (let i = 0; i < imoveis.length; i++) {
      const row = sheet.getRow(tableStartRow + 1 + i);
      row.height = 90;
      row.alignment = { vertical: "middle", wrapText: true };

      // Quebra de texto em colunas longas
      ["titulo", "endereco", "linkLocalizacao"].forEach((key) => {
        row.getCell(key).alignment = { wrapText: true, vertical: "middle" };
      });
    }

    // Inserir imagens
    for (let i = 0; i < imoveis.length; i++) {
      const item = imoveis[i];
      if (!item.imagem) continue;

      const imgData = await fetchImageBuffer(item.imagem);
      if (!imgData) continue;

      const imageId = workbook.addImage({
        buffer: imgData.buffer,
        extension: imgData.ext,
      });

      sheet.addImage(imageId, {
        tl: { col: 0.2, row: tableStartRow + i },
        ext: { width: 120, height: 80 },
        editAs: "oneCell",
      });
    }

    // Bordas leves na tabela
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

    // Enviar arquivo
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=relatorio_imoveis_risco_nivel_mar.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Erro ao gerar Excel:", err);
    res.status(500).json({ error: "Erro ao gerar o relatório Excel." });
  }
});

export default router;