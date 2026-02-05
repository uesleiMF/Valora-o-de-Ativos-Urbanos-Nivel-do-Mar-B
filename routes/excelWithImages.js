import express from "express";
import ExcelJS from "exceljs";
import fs from "fs/promises";
import path from "path";
import axios from "axios";
import QRCode from "qrcode";
import Imovel from "../models/Imovel.js";

const router = express.Router();
const METROS_PARA_CM = 100;

/* ===============================
   FUNÇÃO PARA PEGAR IMAGEM
================================ */
async function fetchImageBuffer(source) {
  if (!source) return null;

  if (/^https?:\/\//i.test(source)) {
    try {
      const res = await axios.get(source, { responseType: "arraybuffer", timeout: 15000 });
      return { buffer: Buffer.from(res.data), ext: "png" };
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
   CALCULAR NÍVEL POR ANO
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
   ROTA
================================ */
router.get("/", async (req, res) => {
  try {
    const imoveis = await Imovel.find().lean();
    if (!imoveis.length) return res.status(404).json({ error: "Nenhum imóvel encontrado." });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Valora Ativos Urbanos";

    /* =====================================================
       ABA 1 — RESUMO CLIMÁTICO
    ===================================================== */
    const clima = {
      cidade: "Belém",
      nivelAtualCm: 30,
      projecao2030Cm: { min: 38, max: 45 },
      projecao2050Cm: { min: 45, max: 65 },
      risco: "Alto",
      fonte: "IPCC AR6 • NASA • NOAA",
      dataAtualizacao: "2025-01-05",
    };

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
       ABA IMÓVEIS
    ===================================================== */
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
        { header: "Valor Previsto 10 anos (R$)", width: 25 },
        { header: "Link Google Maps", width: 38 },
        { header: "QR Code", width: 18 },
      ];

      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

      for (let i = 0; i < imoveis.length; i++) {
        const imovel = imoveis[i];
        const nivelCm = calcularNivelPorAno(imovel, ano);
        const risco = getRiscoTexto(nivelCm);
        const valorPrevisto10 = Math.round((imovel.valorAtual || 0) * 1.1);
        const rowIndex = i + 2;
        sheet.getRow(rowIndex).height = 120;

        sheet.getRow(rowIndex).values = [
          "", // Foto
          imovel.titulo || "",
          imovel.endereco || "",
          imovel.latitude || "",
          imovel.longitude || "",
          nivelCm,
          risco,
          imovel.valorAtual || 0,
          valorPrevisto10,
          imovel.latitude && imovel.longitude ? `https://www.google.com/maps?q=${imovel.latitude},${imovel.longitude}` : "",
          "", // QR Code
        ];

        sheet.getCell(`H${rowIndex}`).numFmt = '"R$ "#,##0.00;[Red]"R$ "-#,##0.00';
        sheet.getCell(`I${rowIndex}`).numFmt = '"R$ "#,##0.00;[Red]"R$ "-#,##0.00';

        /* IMAGEM */
        if (imovel.imagem) {
          const img = await fetchImageBuffer(imovel.imagem);
          if (img) {
            const imgId = workbook.addImage({ buffer: img.buffer, extension: img.ext });
            sheet.addImage(imgId, {
              tl: { col: 0, row: rowIndex - 1 },
              br: { col: 1, row: rowIndex }
            });
          }
        }

        /* QR CODE */
        if (imovel.latitude && imovel.longitude) {
          const mapUrl = `https://www.google.com/maps?q=${imovel.latitude},${imovel.longitude}`;
          const qrBuffer = await QRCode.toBuffer(mapUrl, { width: 120 });
          const qrId = workbook.addImage({ buffer: qrBuffer, extension: "png" });
          sheet.addImage(qrId, {
            tl: { col: 10, row: rowIndex - 1 },
            br: { col: 11, row: rowIndex }
          });
        }
      }
    }

    // Criar abas de imóveis
    await criarAbaImoveis("Imóveis - Atual (2025)", 2025);
    await criarAbaImoveis("Imóveis - Projeção 2030", 2030);
    await criarAbaImoveis("Imóveis - Projeção 2050", 2050);

    // Enviar Excel
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
