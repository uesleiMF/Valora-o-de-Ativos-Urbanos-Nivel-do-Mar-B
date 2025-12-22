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

  // URL remota
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

  // Arquivo local
  try {
    let localPath = path.join(process.cwd(), "uploads", path.basename(source));
    if (source.includes("uploads")) {
      localPath = path.join(process.cwd(), source);
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

    const sheet = workbook.addWorksheet("Imóveis");

    // === TÍTULO NO TOPO (opcional, bonito) ===
    sheet.mergeCells("A1:H2");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "Relatório de Imóveis – Risco de Elevação do Nível do Mar";
    titleCell.font = { size: 18, bold: true, color: { argb: "FF1565C0" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 50;

    // === DATA ===
    sheet.mergeCells("A3:H3");
    const dateCell = sheet.getCell("A3");
    dateCell.value = `Gerado em: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    dateCell.font = { size: 12, italic: true };
    dateCell.alignment = { horizontal: "center" };

    // === TABELA PRINCIPAL (exatamente como você tinha antes) ===
    const tableStartRow = 5; // começa na linha 5 para dar espaço ao título e data

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

    // Dados
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

    // Moeda brasileira
    sheet.getColumn("valorAtual").numFmt = '_-"R$ "* #.##0,00;-"R$ "* #.##0,00';

    // Altura das linhas e quebra de texto
    for (let i = 0; i < imoveis.length; i++) {
      const row = sheet.getRow(tableStartRow + 1 + i);
      row.height = 90;
      row.alignment = { vertical: "middle", wrapText: true };
      row.getCell("titulo").alignment = { wrapText: true };
      row.getCell("endereco").alignment = { wrapText: true };
      row.getCell("linkLocalizacao").alignment = { wrapText: true };
    }

    // Inserir imagens na coluna Foto
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

    // Bordas
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

    // Enviar
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
    res.status(500).json({ error: "Erro ao gerar o relatório." });
  }
});

export default router;