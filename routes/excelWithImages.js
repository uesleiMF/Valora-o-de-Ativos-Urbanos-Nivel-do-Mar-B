import express from "express";
import ExcelJS from "exceljs";
import fs from "fs/promises";
import path from "path";
import axios from "axios";
import QRCode from "qrcode";
import Imovel from "../models/Imovel.js";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===============================
// FUNÇÃO PARA CARREGAR IMAGENS
// ===============================
async function fetchImageBuffer(source) {
  if (!source) return null;

  // 🌐 IMAGEM REMOTA
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
      console.warn("Erro imagem remota:", source);
      return null;
    }
  }

  // 💾 IMAGEM LOCAL
  try {
    let localPath = path.join(process.cwd(), "uploads", path.basename(source));
    if (source.includes("uploads")) {
      localPath = path.join(process.cwd(), source);
    }

    const buffer = await fs.readFile(localPath);
    const ext = path.extname(localPath).slice(1) || "png";

    return { buffer, ext };
  } catch {
    console.warn("Erro imagem local:", source);
    return null;
  }
}

// ===============================
// ROTA PRINCIPAL
// ===============================
router.get("/", async (req, res) => {
  try {
    const imoveis = await Imovel.find().lean();

    if (!imoveis.length) {
      return res.status(404).json({ error: "Nenhum imóvel cadastrado." });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Valora Ativos Urbanos";

    const sheet = workbook.addWorksheet("Imóveis");

    // ===============================
    // TÍTULO
    // ===============================
    sheet.mergeCells("A1:I2");
    sheet.getCell("A1").value =
      "Relatório de Imóveis – Risco de Elevação do Nível do Mar";
    sheet.getCell("A1").font = { size: 20, bold: true };
    sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 55;

    // DATA
    sheet.mergeCells("A3:I3");
    sheet.getCell("A3").value =
      "Gerado em: " +
      new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      });

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
      "Nível do Mar (cm)",
      "Valor (R$)",
      "Mapa",
      "QR Code",
    ];

    sheet.columns = [
      { width: 20 }, // Foto
      { width: 30 },
      { width: 45 },
      { width: 14 },
      { width: 14 },
      { width: 18 },
      { width: 20 },
      { width: 38 },
      { width: 18 }, // QR
    ];

    sheet.getRow(tableStartRow).font = { bold: true };
    sheet.getRow(tableStartRow).alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    // ===============================
    // DADOS
    // ===============================
    for (let i = 0; i < imoveis.length; i++) {
      const item = imoveis[i];
      const rowIndex = tableStartRow + 1 + i;

      sheet.getRow(rowIndex).values = [
        "",
        item.titulo || "",
        item.endereco || "",
        item.latitude ?? "",
        item.longitude ?? "",
        item.nivelDoMar ?? "",
        Number(item.valorAtual) || 0,
        item.latitude && item.longitude
          ? `https://www.google.com/maps?q=${item.latitude},${item.longitude}`
          : "",
        "",
      ];

      sheet.getRow(rowIndex).height = 120;
      sheet.getRow(rowIndex).alignment = {
        vertical: "middle",
        wrapText: true,
      };

      // 💰 MOEDA
      sheet.getCell(`G${rowIndex}`).numFmt =
        '"R$ "#.##0,00;[Red]"R$ "-#.##0,00';

      // ===============================
      // 🖼️ IMAGEM (RESPEITA A LINHA)
      // ===============================
      if (item.imagem) {
        const img = await fetchImageBuffer(item.imagem);
        if (img) {
          const imageId = workbook.addImage({
            buffer: img.buffer,
            extension: img.ext,
          });

          sheet.addImage(imageId, {
            tl: { col: 0.3, row: rowIndex - 0.8 },
            ext: { width: 140, height: 95 },
            editAs: "oneCell",
          });
        }
      }

      // ===============================
      // 📍 QR CODE GOOGLE MAPS
      // ===============================
      if (item.latitude && item.longitude) {
        const mapUrl = `https://www.google.com/maps?q=${item.latitude},${item.longitude}`;
        const qrBuffer = await QRCode.toBuffer(mapUrl);

        const qrId = workbook.addImage({
          buffer: qrBuffer,
          extension: "png",
        });

        sheet.addImage(qrId, {
          tl: { col: 8.3, row: rowIndex - 0.8 },
          ext: { width: 95, height: 95 },
          editAs: "oneCell",
        });
      }
    }

    // ===============================
    // DOWNLOAD
    // ===============================
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=relatorio_imoveis_com_qrcode.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao gerar relatório." });
  }
});

export default router;
