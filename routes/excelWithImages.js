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

const METROS_PARA_CM = 100;

// BUSCAR IMAGEM LOCAL OU REMOTA
async function fetchImageBuffer(source) {
  if (!source) return null;

  // Se for URL
  if (/^https?:\/\//i.test(source)) {
    try {
      const response = await axios.get(source, { responseType: "arraybuffer", timeout: 15000 });
      return { buffer: Buffer.from(response.data), ext: "png" };
    } catch {
      return null;
    }
  }

  // Se for local
  try {
    const localPath = path.join(process.cwd(), source.includes("uploads") ? source : `uploads/${source}`);
    const buffer = await fs.readFile(localPath);
    return { buffer, ext: "png" };
  } catch {
    return null;
  }
}

// CALCULAR NÍVEL DO MAR
function calcularNivelPorAno(imovel, ano) {
  const baseCm = Math.round((Number(imovel.nivelDoMar) || 0) * METROS_PARA_CM);
  if (ano === 2030) return baseCm + 15;
  if (ano === 2050) return baseCm + 35;
  return baseCm;
}

// RETORNAR TEXTO DE RISCO
function getRiscoTexto(cm) {
  if (cm >= 490) return "Alto";
  if (cm >= 190) return "Médio";
  return "Baixo";
}

// ROTA EXCEL
router.get("/", async (req, res) => {
  try {
    const imoveis = await Imovel.find().lean();
    if (!imoveis.length) return res.status(404).json({ error: "Nenhum imóvel encontrado." });

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

    // ABA 1 — RESUMO CLIMÁTICO
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

    // ABA 2 — IMÓVEIS
    const sheet = workbook.addWorksheet("Imóveis");
    sheet.columns = [
      { header: "Foto", width: 18 },
      { header: "Título", width: 30 },
      { header: "Endereço", width: 40 },
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

    for (let i = 0; i < imoveis.length; i++) {
      const imovel = imoveis[i];
      const nivelCm = calcularNivelPorAno(imovel, 2025);
      const risco = getRiscoTexto(nivelCm);
      const rowIndex = i + 2;
      sheet.getRow(rowIndex).height = 110;

      sheet.getRow(rowIndex).values = [
        "", // Foto
        imovel.titulo || "",
        imovel.endereco || "",
        imovel.latitude || "",
        imovel.longitude || "",
        nivelCm,
        risco,
        imovel.valorAtual || 0,
        imovel.valorPrevisto10 || 0,
        imovel.latitude && imovel.longitude ? `https://www.google.com/maps?q=${imovel.latitude},${imovel.longitude}` : "",
        "", // QR Code
      ];

      sheet.getCell(`H${rowIndex}`).numFmt = '"R$"#,##0.00;[Red]\-"R$"#,##0.00';
      sheet.getCell(`I${rowIndex}`).numFmt = '"R$"#,##0.00;[Red]\-"R$"#,##0.00';

      // ADICIONAR FOTO
      if (imovel.imagem) {
        const img = await fetchImageBuffer(imovel.imagem);
        if (img) {
          const imgId = workbook.addImage({ buffer: img.buffer, extension: img.ext });
          sheet.addImage(imgId, { tl: { col: 0, row: rowIndex - 1 }, ext: { width: 120, height: 80 } });
        }
      }

      // ADICIONAR QR CODE
      if (imovel.latitude && imovel.longitude) {
        const mapUrl = `https://www.google.com/maps?q=${imovel.latitude},${imovel.longitude}`;
        const qrBuffer = await QRCode.toBuffer(mapUrl);
        const qrId = workbook.addImage({ buffer: qrBuffer, extension: "png" });
        sheet.addImage(qrId, { tl: { col: 10, row: rowIndex - 1 }, ext: { width: 85, height: 85 } });
      }
    }

    // ENVIAR EXCEL
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=relatorio_imoveis_com_fotos_e_qrcode.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao gerar relatório Excel" });
  }
});

export default router;
