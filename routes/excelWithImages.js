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
   FUNÇÃO IMAGEM
================================ */
async function fetchImageBuffer(source) {
  if (!source) return null;

  if (/^https?:\/\//i.test(source)) {
    try {
      const response = await axios.get(source, {
        responseType: "arraybuffer",
        timeout: 15000,
      });
      return { buffer: Buffer.from(response.data), ext: "png" };
    } catch {
      return null;
    }
  }

  try {
    const localPath = path.join(process.cwd(), source.includes("uploads") ? source : `uploads/${source}`);
    const buffer = await fs.readFile(localPath);
    return { buffer, ext: "png" };
  } catch {
    return null;
  }
}

/* ===============================
   FUNÇÃO RISCO
================================ */
function getCorRisco(cm) {
  if (cm >= 490) return "Alto";
  if (cm >= 190) return "Médio";
  return "Baixo";
}

/* ===============================
   ROTA
================================ */
router.get("/", async (req, res) => {
  try {
    const imoveis = await Imovel.find().lean();
    if (!imoveis.length) {
      return res.status(404).json({ error: "Nenhum imóvel encontrado." });
    }

    // Dados climáticos (fixos / oficiais)
    const clima = {
      cidade: "Belém",
      nivelAtualCm: 0,
      projecao2030Cm: { min: 8, max: 15 },
      projecao2050Cm: { min: 15, max: 35 },
      risco: "Alto",
      fonte: "IPCC AR6 • NASA • NOAA",
      dataAtualizacao: "2025-01-05",
    };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Valora Ativos Urbanos";

    /* =====================================================
       ABA 1 — RESUMO CLIMÁTICO
    ===================================================== */
    const resumo = workbook.addWorksheet("Resumo Climático");
    resumo.columns = [
      { header: "Item", width: 35 },
      { header: "Valor", width: 50 },
    ];
    resumo.addRows([
      ["Cidade", clima.cidade],
      ["Nível do mar atual (cm)", clima.nivelAtualCm],
      ["Projeção 2030 (cm)", `${clima.projecao2030Cm.min} – ${clima.projecao2030Cm.max}`],
      ["Projeção 2050 (cm)", `${clima.projecao2050Cm.min} – ${clima.projecao2050Cm.max}`],
      ["Risco", clima.risco],
      ["Fonte", clima.fonte],
      ["Atualização", clima.dataAtualizacao],
    ]);
    resumo.getRow(1).font = { bold: true };

    /* =====================================================
       ABA 2 — BASE CIENTÍFICA
    ===================================================== */
    const base = workbook.addWorksheet("Base Científica");
    base.mergeCells("A1:B12");
    base.getCell("A1").value = `
Relatório fundamentado em bases científicas oficiais:

• IPCC – Sixth Assessment Report (AR6)
• NASA – Sea Level Change Program
• NOAA – Global Mean Sea Level
• ONU – Climate Change Reports

Observação regional:
Em Belém, fatores como subsidência do solo,
marés amplificadas e drenagem urbana deficiente
agravam os impactos da elevação do nível do mar.
`;
    base.getCell("A1").alignment = { wrapText: true, vertical: "top" };

    /* =====================================================
       FUNÇÃO TABELA IMÓVEIS
    ===================================================== */
    async function criarAbaImoveis(nome, tipo) {
      const sheet = workbook.addWorksheet(nome);

      sheet.columns = [
        { header: "Foto", width: 18 },
        { header: "Título", width: 30 },
        { header: "Endereço", width: 45 },
        { header: "Latitude", width: 14 },
        { header: "Longitude", width: 14 },
        { header: "Nível do mar (cm)", width: 18 },
        { header: "Risco", width: 14 },
        { header: "Valor (R$)", width: 20 },
        { header: "Mapa", width: 38 },
        { header: "QR Code", width: 18 },
      ];

      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

      for (let i = 0; i < imoveis.length; i++) {
        const imovel = imoveis[i];

        let nivelCm = imovel.nivelAtualCm || 0;
        if (tipo === 2030) nivelCm = imovel.projecao2030Cm?.max ?? nivelCm;
        if (tipo === 2050) nivelCm = imovel.projecao2050Cm?.max ?? nivelCm;

        const risco = getCorRisco(nivelCm);

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
          imovel.valorAtual || 0,
          imovel.latitude && imovel.longitude
            ? `https://www.google.com/maps?q=${imovel.latitude},${imovel.longitude}`
            : "",
          "",
        ];

        sheet.getCell(`H${rowIndex}`).numFmt =
          '"R$ "#.##0,00;[Red]"R$ "-#.##0,00';

        // IMAGEM
        if (imovel.imagem) {
          const img = await fetchImageBuffer(imovel.imagem);
          if (img) {
            const imgId = workbook.addImage({
              buffer: img.buffer,
              extension: img.ext,
            });
            sheet.addImage(imgId, {
              tl: { col: 0.3, row: rowIndex - 0.8 },
              ext: { width: 120, height: 80 },
              editAs: "oneCell",
            });
          }
        }

        // QR CODE
        if (imovel.latitude && imovel.longitude) {
          const mapUrl = `https://www.google.com/maps?q=${imovel.latitude},${imovel.longitude}`;
          const qr = await QRCode.toBuffer(mapUrl);
          const qrId = workbook.addImage({ buffer: qr, extension: "png" });

          sheet.addImage(qrId, {
            tl: { col: 9.3, row: rowIndex - 0.8 },
            ext: { width: 85, height: 85 },
            editAs: "oneCell",
          });
        }
      }
    }

    /* =====================================================
       ABAS DE IMÓVEIS
    ===================================================== */
    await criarAbaImoveis("Imóveis - Atual (2025)", 2025);
    await criarAbaImoveis("Imóveis - Projeção 2030", 2030);
    await criarAbaImoveis("Imóveis - Projeção 2050", 2050);

    /* =====================================================
       DOWNLOAD
    ===================================================== */
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=relatorio_completo_valora.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao gerar relatório." });
  }
});

export default router;
