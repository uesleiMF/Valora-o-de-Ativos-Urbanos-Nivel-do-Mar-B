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
      console.warn("Erro imagem remota:", err.message);
      return null;
    }
  }

  try {
    let localPath = path.join(process.cwd(), "uploads", path.basename(source));
    if (source.includes("uploads")) localPath = path.join(process.cwd(), source);

    const buffer = await fs.readFile(localPath);
    const ext = path.extname(localPath).slice(1).toLowerCase() === "jpg" ? "jpeg" : path.extname(localPath).slice(1);
    return { buffer, ext: ext || "png" };
  } catch (err) {
    console.warn("Erro imagem local:", err.message);
    return null;
  }
}

router.get("/", async (req, res) => {
  try {
    const imoveis = await Imovel.find().lean();
    if (imoveis.length === 0) return res.status(404).json({ error: "Nenhum imóvel." });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Valora Ativos Urbanos";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Relatório");

    // === TÍTULO CENTRALIZADO ===
    sheet.mergeCells("A1:H3");
    const title = sheet.getCell("A1");
    title.value = "Relatório de Imóveis – Risco de Elevação do Nível do Mar";
    title.font = { size: 20, bold: true, color: { argb: "FF1565C0" } };
    title.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 60;

    // === DATA ATUAL ABAIXO DO TÍTULO ===
    sheet.mergeCells("A4:H4");
    const dateCell = sheet.getCell("A4");
    dateCell.value = `Gerado em: ${new Date().toLocaleDateString("pt-BR")}`;
    dateCell.font = { size: 12, italic: true };
    dateCell.alignment = { horizontal: "center" };

    // === CONTAGEM DE RISCO ===
    const riscoCount = { Baixo: 0, Médio: 0, Alto: 0 };
    imoveis.forEach(i => {
      const r = i.risco || "Baixo";
      if (riscoCount[r] !== undefined) riscoCount[r]++;
    });

    // === TABELA DE RESUMO DOS RISCOS (vai virar gráfico no Excel) ===
    sheet.getCell("A6").value = "Resumo de Riscos";
    sheet.getCell("A6").font = { bold: true, size: 14 };

    sheet.getCell("A7").value = "Nível de Risco";
    sheet.getCell("B7").value = "Quantidade";
    sheet.getCell("C7").value = "Porcentagem";

    const riscos = ["Baixo", "Médio", "Alto"];
    let rowNum = 8;
    riscos.forEach(r => {
      const qtd = riscoCount[r];
      if (qtd > 0) {
        sheet.getCell(`A${rowNum}`).value = r;
        sheet.getCell(`B${rowNum}`).value = qtd;
        sheet.getCell(`C${rowNum}`).value = { formula: `=B${rowNum}/${imoveis.length}`, numFmt: '0.00%' };
        rowNum++;
      }
    });

    // Cores nas linhas do resumo
    sheet.getCell("A7").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCCCCCC" } };
    sheet.getCell("B7").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCCCCCC" } };
    sheet.getCell("C7").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCCCCCC" } };

    // === TABELA PRINCIPAL ===
    const startRow = 14;
    sheet.columns = [
      { header: "Foto", key: "foto", width: 18 },
      { header: "Título", key: "titulo", width: 35 },
      { header: "Endereço", key: "endereco", width: 45 },
      { header: "Latitude", key: "latitude", width: 15 },
      { header: "Longitude", key: "longitude", width: 15 },
      { header: "Nível do Mar (m)", key: "nivelDoMar", width: 18 },
      { header: "Valor Atual (R$)", key: "valorAtual", width: 22 },
      { header: "Link Localização", key: "link", width: 40 },
    ];

    const header = sheet.getRow(startRow);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1565C0" } };
    header.height = 30;
    header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    imoveis.forEach(item => {
      sheet.addRow({
        foto: "",
        titulo: item.titulo || "",
        endereco: item.endereco || "",
        latitude: item.latitude ?? "",
        longitude: item.longitude ?? "",
        nivelDoMar: item.nivelDoMar ?? "",
        valorAtual: Number(item.valorAtual) || 0,
        link: item.linkLocalizacao || (item.latitude && item.longitude ? `https://www.google.com/maps?q=${item.latitude},${item.longitude}` : ""),
      });
    });

    // MOEDA BRASILEIRA GARANTIDA
    sheet.getColumn(7).numFmt = '_-"R$ "* #.##0,00;-"R$ "* #.##0,00';

    // Altura e imagens
    for (let i = 0; i < imoveis.length; i++) {
      const row = sheet.getRow(startRow + 1 + i);
      row.height = 90;
      if (imoveis[i].imagem) {
        const img = await fetchImageBuffer(imoveis[i].imagem);
        if (img) {
          const id = workbook.addImage({ buffer: img.buffer, extension: img.ext });
          sheet.addImage(id, {
            tl: { col: 0.2, row: startRow + i },
            ext: { width: 120, height: 80 },
          });
        }
      }
    }

    // Bordas
    sheet.eachRow((row, n) => {
      if (n >= startRow) {
        row.eachCell(cell => {
          cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        });
      }
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=relatorio_imoveis.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao gerar relatório");
  }
});

export default router;