import express from "express";
import ExcelJS from "exceljs";
import fs from "fs/promises";
import path from "path";
import axios from "axios";
import Imovel from "../models/Imovel.js";
import { fileURLToPath } from "url";

const router = express.Router();

// Resolver __dirname (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper: pega buffer de uma URL ou de arquivo local
async function fetchImageBuffer(source) {
  if (/^https?:\/\//i.test(source)) {
    try {
      const response = await axios.get(source, { responseType: "arraybuffer", timeout: 15000 });
      const contentType = response.headers["content-type"] || "";
      let ext = "png";
      if (contentType.includes("jpeg")) ext = "jpeg";
      else if (contentType.includes("png")) ext = "png";
      return { buffer: Buffer.from(response.data), ext };
    } catch (err) {
      console.warn("Erro ao baixar imagem remota:", source, err.message);
      return null;
    }
  }

  try {
    let localPath = source;
    if (!path.isAbsolute(localPath)) {
      localPath = path.join(process.cwd(), "uploads", source);
      if (source.includes("uploads")) {
        localPath = path.join(process.cwd(), source);
      }
    }
    const buffer = await fs.readFile(localPath);
    const ext = path.extname(localPath).replace(".", "") || "png";
    return { buffer, ext };
  } catch (err) {
    console.warn("Erro ao ler arquivo local:", source, err.message);
    return null;
  }
}

// ROTA AGORA É /api/excel
router.get("/", async (req, res) => {
  try {
    const imoveis = await Imovel.find().lean();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Sistema";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Imóveis");

    sheet.columns = [
      { header: "Foto", key: "foto", width: 20 },
      { header: "Título", key: "titulo", width: 30 },
      { header: "Endereço", key: "endereco", width: 40 },
      { header: "Latitude", key: "latitude", width: 15 },
      { header: "Longitude", key: "longitude", width: 15 },
      { header: "Nível do Mar (m)", key: "nivelDoMar", width: 18 },
      { header: "Valor Atual (R$)", key: "valorAtual", width: 20 },
      { header: "Link de Localização", key: "linkLocalizacao", width: 40 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = { from: "A1", to: "H1" };

    imoveis.forEach((item) => {
      sheet.addRow({
        foto: "",
        titulo: item.titulo || "",
        endereco: item.endereco || "",
        latitude: item.latitude ?? "",
        longitude: item.longitude ?? "",
        nivelDoMar: item.nivelDoMar ?? "",
        valorAtual: item.valorAtual ?? "",
        linkLocalizacao:
          item.linkLocalizacao ||
          (item.latitude && item.longitude
            ? `https://www.google.com/maps?q=${item.latitude},${item.longitude}`
            : ""),
      });
    });

    const imageWidth = 120;
    const imageHeight = 90;
    const rowHeightEmPoints = Math.round(imageHeight * 0.75);

    const startDataRow = 2;
    for (let i = startDataRow; i < startDataRow + imoveis.length; i++) {
      sheet.getRow(i).height = rowHeightEmPoints;
    }

    for (let i = 0; i < imoveis.length; i++) {
      const item = imoveis[i];
      const rowIndex = startDataRow + i;

      if (!item.imagem) continue;

      const fetched = await fetchImageBuffer(item.imagem);
      if (!fetched) continue;

      const { buffer, ext } = fetched;

      const imageId = workbook.addImage({
        buffer,
        extension: ext === "jpg" ? "jpeg" : ext,
      });

      sheet.addImage(imageId, {
        tl: { col: 0.15, row: rowIndex - 1 + 0.12 },
        ext: { width: imageWidth, height: imageHeight },
      });
    }

    const totalRows = imoveis.length + 1;
    for (let r = 1; r <= totalRows; r++) {
      const row = sheet.getRow(r);
      row.alignment = { vertical: "middle", wrapText: true };
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    }

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
    console.error("Erro gerando Excel:", err);
    res.status(500).json({ error: "Erro ao gerar Excel com imagens" });
  }
});

export default router;
