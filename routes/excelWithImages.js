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

    // TÍTULO (merge só linhas 1 e 2)
    sheet.mergeCells("A1:H2");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "Relatório de Imóveis – Risco de Elevação do Nível do Mar";
    titleCell.font = { size: 20, bold: true, color: { argb: "FF1565C0" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 60;

    // DATA (linha 3)
    sheet.mergeCells("A3:H3");
    const dateCell = sheet.getCell("A3");
    dateCell.value = `Gerado em: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    dateCell.font = { size: 12, italic: true };
    dateCell.alignment = { horizontal: "center" };

    // CABEÇALHO DA TABELA NA LINHA 5 (espaço suficiente)
    const headerRowNumber = 5;
    sheet.getRow(headerRowNumber).values = [
      "Foto",
      "Título",
      "Endereço",
      "Latitude",
      "Longitude",
      "Nível do Mar (m)",
      "Valor Atual (R$)",
      "Link de Localização",
    ];

    const headerRow = sheet.getRow(headerRowNumber);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1565C0" } };
    headerRow.height = 40;
    headerRow.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    // Larguras das colunas
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

    // Dados dos imóveis (começando na linha 6)
    imoveis.forEach((item, index) => {
      const row = sheet.getRow(headerRowNumber + 1 + index);
      row.values = [
        "", // Foto (vazia, imagem inserida depois)
        item.titulo || "",
        item.endereco || "",
        item.latitude ?? "",
        item.longitude ?? "",
        item.nivelDoMar ?? "",
        Number(item.valorAtual) || 0,
        item.linkLocalizacao ||
          (item.latitude && item.longitude
            ? `https://www.google.com/maps?q=${item.latitude},${item.longitude}`
            : ""),
      ];
      row.height = 90;
      row.alignment = { vertical: "middle", wrapText: true };
    });

    // Moeda brasileira
    sheet.getColumn(7).numFmt = '_-"R$ "* #.##0,00;-"R$ "* #.##0,00';

    // Inserir imagens
    imoveis.forEach(async (item, index) => {
      if (!item.imagem) return;

      const imgData = await fetchImageBuffer(item.imagem);
      if (!imgData) return;

      const imageId = workbook.addImage({
        buffer: imgData.buffer,
        extension: imgData.ext,
      });

      sheet.addImage(imageId, {
        tl: { col: 0.2, row: headerRowNumber + index },
        ext: { width: 120, height: 80 },
        editAs: "oneCell",
      });
    });

    // Bordas na tabela
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber >= headerRowNumber) {
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

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=imoveis_com_fotos.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Erro ao gerar Excel:", err);
    res.status(500).json({ error: "Erro ao gerar relatório." });
  }
});

export default router;