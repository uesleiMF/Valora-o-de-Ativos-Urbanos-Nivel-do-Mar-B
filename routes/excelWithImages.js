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
async function fetchImageBuffer(source) {
  if (!source) return null;

  // URL remota
  if (/^https?:\/\//i.test(source)) {
    try {
      const response = await axios.get(source, {
        responseType: "arraybuffer",
        timeout: 15000,
      });
      const contentType = response.headers["content-type"] || "image/png";
      let ext = "png";
      if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpeg";
      else if (contentType.includes("png")) ext = "png";

      return { buffer: Buffer.from(response.data), ext };
    } catch (err) {
      console.warn("Erro ao baixar imagem remota:", source, err.message);
      return null;
    }
  }

  // Arquivo local
  try {
    let localPath = source;
    if (!path.isAbsolute(localPath)) {
      localPath = path.join(process.cwd(), "uploads", path.basename(source));
      if (source.includes("uploads")) {
        localPath = path.join(process.cwd(), source);
      }
    }

    const buffer = await fs.readFile(localPath);
    const extRaw = path.extname(localPath).slice(1).toLowerCase();
    const ext = extRaw === "jpg" ? "jpeg" : extRaw || "png";
    return { buffer, ext };
  } catch (err) {
    console.warn("Erro ao ler imagem local:", source, err.message);
    return null;
  }
}

// ===============================
// ROTA → /api/excel
// ===============================
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

    // === COLUNAS ===
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

    // === CABEÇALHO ESTILIZADO ===
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E88E5" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    headerRow.height = 35;

    // Filtro automático
    sheet.autoFilter = { from: "A1", to: "H1" };

    // === ADICIONAR DADOS ===
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

    // === ESTILO DAS LINHAS DE DADOS ===
    const startRow = 2;
    for (let i = startRow; i < startRow + imoveis.length; i++) {
      const row = sheet.getRow(i);
      row.height = 90; // Altura fixa para caber a imagem
      row.alignment = { vertical: "middle", wrapText: true };

      // Quebra de texto nas colunas longas
      row.getCell("titulo").alignment = { wrapText: true, vertical: "middle" };
      row.getCell("endereco").alignment = { wrapText: true, vertical: "middle" };
      row.getCell("linkLocalizacao").alignment = { wrapText: true };

      // Centralizar números
      row.getCell("latitude").alignment = { horizontal: "center" };
      row.getCell("longitude").alignment = { horizontal: "center" };
      row.getCell("nivelDoMar").alignment = { horizontal: "center" };
    }

    // === FORMATAR MOEDA BRASILEIRA (R$ 1.234.567,89) ===
    sheet.getColumn("valorAtual").numFmt = '_-"R$ "* #.##0,00;-"R$ "* #.##0,00';

    // === INSERIR IMAGENS ===
    for (let i = 0; i < imoveis.length; i++) {
      const item = imoveis[i];
      const rowIndex = startRow + i;

      if (!item.imagem) continue;

      const fetched = await fetchImageBuffer(item.imagem);
      if (!fetched) continue;

      const { buffer, ext } = fetched;
      const imageId = workbook.addImage({
        buffer,
        extension: ext,
      });

      sheet.addImage(imageId, {
        tl: { col: 0.2, row: rowIndex - 1 + 0.1 },
        ext: { width: 120, height: 80 },
        editAs: "oneCell",
      });
    }

    // === BORDAS LEVES EM TODA A TABELA ===
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFD0D0D0" } },
          left: { style: "thin", color: { argb: "FFD0D0D0" } },
          bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
          right: { style: "thin", color: { argb: "FFD0D0D0" } },
        };
      });
    });

    // === RESPOSTA ===
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
    res.status(500).json({ error: "Erro interno ao gerar o Excel." });
  }
});

export default router;