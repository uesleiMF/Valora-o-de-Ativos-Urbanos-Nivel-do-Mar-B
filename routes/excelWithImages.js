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
   FUNÇÃO IMAGEM
================================ */
async function fetchImageBuffer(source) {
  if (!source) return null;

  // URL (Cloudinary)
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

  // Local
  try {
    const localPath = path.join(process.cwd(), source);
    const buffer = await fs.readFile(localPath);
    return { buffer, ext: "png" };
  } catch {
    return null;
  }
}

/* ===============================
   NÍVEL DO MAR POR ANO
================================ */
function calcularNivelPorAno(imovel, ano) {
  const baseCm = Math.round((Number(imovel.nivelDoMar) || 0) * METROS_PARA_CM);

  if (ano === 2030) return baseCm + 15;
  if (ano === 2050) return baseCm + 35;

  return baseCm; // 2025
}

/* ===============================
   RISCO
================================ */
function getRiscoTexto(cm) {
  if (cm >= 490) return "Alto";
  if (cm >= 190) return "Médio";
  return "Baixo";
}

/* ===============================
   ROTA ➜ GET /api/excel
================================ */
router.get("/", async (req, res) => {
  try {
    const imoveis = await Imovel.find().lean();

    if (!imoveis.length) {
      return res.status(404).json({ error: "Nenhum imóvel encontrado." });
    }

    /* ===============================
       DADOS CLIMÁTICOS
    ================================ */
    const clima = {
      cidade: "Belém",
      nivelAtualCm: 30,
      projecao2030Cm: { min: 38, max: 45 },
      projecao2050Cm: { min: 45, max: 65 },
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
      { header: "Valor", width: 55 },
    ];

    resumo.addRows([
      ["Cidade", clima.cidade],
      ["Nível do mar atual (cm)", clima.nivelAtualCm],
      [
        "Projeção 2030 (cm)",
        `${clima.projecao2030Cm.min} – ${clima.projecao2030Cm.max}`,
      ],
      [
        "Projeção 2050 (cm)",
        `${clima.projecao2050Cm.min} – ${clima.projecao2050Cm.max}`,
      ],
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
    base.getCell("A1").alignment = {
      wrapText: true,
      vertical: "top",
    };

    /* =====================================================
       FUNÇÃO CRIAR ABA DE IMÓVEIS
    ===================================================== */
    async function criarAbaImoveis(nome, ano) {
      const sheet = workbook.addWorksheet(nome);

      sheet.columns = [
        { header: "Foto", width: 18 },
        { header: "Título", width: 30 },
        { header: "Tipo", width: 18 },
        { header: "Endereço", width: 45 },
        { header: "Latitude", width: 14 },
        { header: "Longitude", width: 14 },
        { header: "Nível do mar (cm)", width: 20 },
        { header: "Risco", width: 14 },
        { header: "Valor Atual (R$)", width: 22 },
        { header: "Mapa", width: 38 },
        { header: "QR Code", width: 18 },
      ];

      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).alignment = { horizontal: "center" };

      for (let i = 0; i < imoveis.length; i++) {
        const imovel = imoveis[i];
        const nivelCm = calcularNivelPorAno(imovel, ano);
        const risco = getRiscoTexto(nivelCm);

        const rowIndex = i + 2;
        sheet.getRow(rowIndex).height = 110;

        sheet.getRow(rowIndex).values = [
          "",
          imovel.titulo || "",
          imovel.tipo || "",
          imovel.endereco || "",
          imovel.latitude ?? "",
          imovel.longitude ?? "",
          nivelCm,
          risco,
          Number(imovel.valorAtual) || 0,
          imovel.latitude && imovel.longitude
            ? `https://www.google.com/maps?q=${imovel.latitude},${imovel.longitude}`
            : "",
          "",
        ];

        sheet.getCell(`I${rowIndex}`).numFmt =
          '"R$ "#,##0.00;[Red]"R$ "-#,##0.00';

        /* FOTO */
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

        /* QR CODE */
        if (imovel.latitude && imovel.longitude) {
          const mapUrl = `https://www.google.com/maps?q=${imovel.latitude},${imovel.longitude}`;
          const qr = await QRCode.toBuffer(mapUrl);
          const qrId = workbook.addImage({
            buffer: qr,
            extension: "png",
          });

          sheet.addImage(qrId, {
            tl: { col: 10.3, row: rowIndex - 0.8 },
            ext: { width: 85, height: 85 },
            editAs: "oneCell",
          });
        }
      }
    }

    /* =====================================================
       ABAS
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
      "attachment; filename=relatorio_valora.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Erro Excel:", err);
    res.status(500).json({ error: "Erro ao gerar relatório Excel" });
  }
});

export default router;
