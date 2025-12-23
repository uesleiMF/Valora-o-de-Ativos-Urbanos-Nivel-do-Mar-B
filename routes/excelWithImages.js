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

// ===============================
// Função para carregar imagens
// ===============================
async function fetchImageBuffer(source) {
  if (!source) return null;

  if (/^https?:\/\//i.test(source)) {
    try {
      const response = await axios.get(source, {
        responseType: "arraybuffer",
        timeout: 15000,
      });
      const contentType = response.headers["content-type"] || "image/png";
      const ext = contentType.includes("jpeg") || contentType.includes("jpg")
        ? "jpeg"
        : "png";
      return { buffer: Buffer.from(response.data), ext };
    } catch {
      return null;
    }
  }

  try {
    let localPath = path.join(process.cwd(), "uploads", path.basename(source));
    if (source.includes("uploads")) {
      localPath = path.join(process.cwd(), source);
    }
    const buffer = await fs.readFile(localPath);
    const ext = path.extname(localPath).replace(".", "") || "png";
    return { buffer, ext };
  } catch {
    return null;
  }
}

// ===============================
// ROTA DE EXPORTAÇÃO
// ===============================
router.get("/", async (req, res) => {
  try {
    const imoveis = await Imovel.find().lean();

    if (!imoveis.length) {
      return res.status(404).json({ error: "Nenhum imóvel encontrado." });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Valora Ativos Urbanos";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Imóveis");

    // ===============================
    // TÍTULO
    // ===============================
    sheet.mergeCells("A1:H2");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "Relatório de Imóveis – Risco de Elevação do Nível do Mar";
    titleCell.font = { size: 20, bold: true };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 60;

    // ===============================
    // DATA BRASIL (SP)
    // ===============================
    sheet.mergeCells("A3:H3");
    sheet.getCell("A3").value = `Gerado em: ${new Date().toLocaleString(
      "pt-BR",
      { timeZone: "America/Sao_Paulo" }
    )}`;
    sheet.getCell("A3").alignment = { horizontal: "center" };
    sheet.getCell("A3").font = { italic: true };

    // ===============================
    // CABEÇALHO DA TABELA
    // ===============================
    const tableStartRow = 6;

    sheet.getRow(tableStartRow).values = [
      "Foto",
      "Título",
      "Endereço",
      "Latitude",
      "Longitude",
      "Nível do Mar (m)",
      "Valor Atual (R$)",
      "Link",
    ];

    const headerRow = sheet.getRow(tableStartRow);
    headerRow.font = { bold: true };
    headerRow.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    headerRow.height = 40;

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

    // ===============================
    // DADOS
    // ===============================
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

      // ===============================
      // 💰 FORMATO REAL BRASILEIRO CORRETO
      // ===============================
      const valorCell = sheet.getCell(`G${rowIndex}`);
      valorCell.value = valor;
      valorCell.numFmt = '"R$ "#.##0,00;[Red]"R$ "-#.##0,00';

      // ===============================
      // IMAGEM
      // ===============================
      if (item.imagem) {
        const promise = fetchImageBuffer(item.imagem).then((img) => {
          if (img) {
            const imageId = workbook.addImage({
              buffer: img.buffer,
              extension: img.ext,
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

    // ===============================
    // BORDAS
    // ===============================
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber >= tableStartRow) {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
      }
    });

    // ===============================
    // DOWNLOAD
    // ===============================
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=imoveis.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao gerar relatório." });
  }
});

export default router;
