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

/* ===============================
   CONSTANTES
================================ */
const METROS_PARA_CM = 100;

/* ===============================
   FUNÇÃO PARA BUSCAR IMAGEM
================================ */
async function fetchImageBuffer(source) {
  if (!source) return null;

  // URL externa
  if (/^https?:\/\//i.test(source)) {
    try {
      const response = await axios.get(source, { responseType: "arraybuffer", timeout: 15000 });
      return { buffer: Buffer.from(response.data), ext: "png" };
    } catch {
      return null;
    }
  }

  // Arquivo local
  try {
    const localPath = path.join(process.cwd(), source.includes("uploads") ? source : `uploads/${source}`);
    const buffer = await fs.readFile(localPath);
    return { buffer, ext: "png" };
  } catch {
    return null;
  }
}

/* ===============================
   CALCULA NÍVEL DO MAR
================================ */
function calcularNivelPorAno(imovel, ano) {
  const baseCm = Math.round((Number(imovel.nivelDoMar) || 0) * METROS_PARA_CM);
  if (ano === 2030) return baseCm + 15;
  if (ano === 2050) return baseCm + 35;
  return baseCm; // 2025
}

/* ===============================
   CALCULA RISCO
================================ */
function getRiscoTexto(cm) {
  if (cm >= 490) return "Alto";
  if (cm >= 190) return "Médio";
  return "Baixo";
}

/* ===============================
   ROTA PARA GERAR EXCEL
================================ */
router.get("/", async (req, res) => {
  try {
    const imoveis = await Imovel.find().lean();
    if (!imoveis.length) return res.status(404).json({ error: "Nenhum imóvel encontrado." });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Valora Ativos Urbanos";

    /* ===============================
       FUNÇÃO PARA CRIAR ABA DE IMÓVEIS
    ================================ */
    async function criarAbaImoveis(nome, ano) {
      const sheet = workbook.addWorksheet(nome);

      sheet.columns = [
        { header: "Foto", width: 18 },
        { header: "Título", width: 30 },
        { header: "Endereço", width: 45 },
        { header: "Latitude", width: 14 },
        { header: "Longitude", width: 14 },
        { header: "Nível do mar (cm)", width: 20 },
        { header: "Risco", width: 14 },
        { header: "Valor Atual (R$)", width: 20 },
        { header: "Previsto 10 anos (R$)", width: 22 },
        { header: "Mapa", width: 38 },
        { header: "QR Code", width: 18 },
      ];

      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

      for (let i = 0; i < imoveis.length; i++) {
        const imovel = imoveis[i];
        const nivelCm = calcularNivelPorAno(imovel, ano);
        const risco = getRiscoTexto(nivelCm);

        const valorAtual = Number(imovel.valorAtual) || 0;
        const valorPrevisto10 = Math.round(valorAtual * 1.1); // +10% em 10 anos

        const rowIndex = i + 2;
        sheet.getRow(rowIndex).height = 110;

        sheet.getRow(rowIndex).values = [
          "",
          imovel.titulo || "",
          imovel.endereco || "",
          imovel.latitude || "",
          imovel.longitude || "",
          nivelCm,
          risco,
          valorAtual,
          valorPrevisto10,
          imovel.latitude && imovel.longitude
            ? `https://www.google.com/maps?q=${imovel.latitude},${imovel.longitude}`
            : "",
          "",
        ];

        // Formatação monetária
        sheet.getCell(`H${rowIndex}`).numFmt = '"R$"#,##0.00;[Red]"R$"-#,##0.00';
        sheet.getCell(`I${rowIndex}`).numFmt = '"R$"#,##0.00;[Red]"R$"-#,##0.00';

        // FOTO
        if (imovel.imagem) {
          const img = await fetchImageBuffer(imovel.imagem);
          if (img) {
            const imgId = workbook.addImage({ buffer: img.buffer, extension: img.ext });
            sheet.addImage(imgId, { tl: { col: 0.3, row: rowIndex - 0.8 }, ext: { width: 120, height: 80 } });
          }
        }

        // QR CODE
        if (imovel.latitude && imovel.longitude) {
          const mapUrl = `https://www.google.com/maps?q=${imovel.latitude},${imovel.longitude}`;
          const qrBuffer = await QRCode.toBuffer(mapUrl);
          const qrId = workbook.addImage({ buffer: qrBuffer, extension: "png" });
          sheet.addImage(qrId, { tl: { col: 10.3, row: rowIndex - 0.8 }, ext: { width: 85, height: 85 } });
        }
      }
    }

    // Criar abas
    await criarAbaImoveis("Imóveis - Atual (2025)", 2025);
    await criarAbaImoveis("Imóveis - Projeção 2030", 2030);
    await criarAbaImoveis("Imóveis - Projeção 2050", 2050);

    /* ===============================
       DOWNLOAD
    ================================ */
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=relatorio_valora_completo.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Erro ao gerar Excel:", err);
    res.status(500).json({ error: "Erro ao gerar relatório." });
  }
});

export default router;
