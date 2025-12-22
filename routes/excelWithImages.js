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

    // === 1. TÍTULO CENTRALIZADO GRANDE ===
    sheet.mergeCells("A1:H2");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "Relatório de Imóveis – Risco de Elevação do Nível do Mar";
    titleCell.font = { size: 20, bold: true, color: { argb: "FF1565C0" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 50;

    // === 2. CONTAGEM DOS RISCOS PARA O GRÁFICO ===
    const riscoCount = { Baixo: 0, Médio: 0, Alto: 0 };
    imoveis.forEach((item) => {
      const risco = item.risco || "Baixo"; // fallback se não tiver risco definido
      if (risco in riscoCount) riscoCount[risco]++;
    });

    const totalImoveis = imoveis.length;
    const dataGrafico = Object.entries(riscoCount)
      .filter(([_, count]) => count > 0)
      .map(([risco, count]) => ({
        risco,
        count,
        percentage: Math.round((count / totalImoveis) * 100),
      }));

    // === 3. GRÁFICO DE PIZZA ===
    if (dataGrafico.length > 0) {
      sheet.mergeCells("A4:H7"); // espaço reservado para o gráfico

      const chart = {
        type: "pie",
        data: {
          labels: dataGrafico.map((d) => `${d.risco} (${d.percentage}%)`),
          datasets: [
            {
              data: dataGrafico.map((d) => d.count),
              backgroundColor: ["#52C41A", "#FAAD14", "#F5222D"], // Verde, Laranja, Vermelho
              borderColor: "#FFFFFF",
              borderWidth: 3,
            },
          ],
        },
        options: {
          responsive: false,
          plugins: {
            title: {
              display: true,
              text: "Distribuição dos Imóveis por Nível de Risco",
              font: { size: 16, weight: "bold" },
              color: "#000000",
              padding: { top: 20, bottom: 20 },
            },
            legend: {
              position: "bottom",
              labels: { font: { size: 14 }, padding: 20 },
            },
          },
        },
      };

      sheet.addChart(chart, {
        x: 100,   // posição horizontal
        y: 100,   // posição vertical
        width: 520,
        height: 380,
      });
    }

    // === 4. TABELA COMEÇA NA LINHA 10 ===
    const tableStartRow = 10;

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
    headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    headerRow.height = 40;
    sheet.autoFilter = { from: `A${tableStartRow}`, to: `H${tableStartRow}` };

    // Adicionar os dados
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

    // Formatação da moeda brasileira
    sheet.getColumn("valorAtual").numFmt = '_-"R$ "* #.##0,00;-"R$ "* #.##0,00';

    // Estilo das linhas de dados
    for (let i = tableStartRow + 1; i <= tableStartRow + imoveis.length; i++) {
      const row = sheet.getRow(i);
      row.height = 90;
      row.alignment = { vertical: "middle", wrapText: true };

      row.getCell("titulo").alignment = { wrapText: true, vertical: "middle" };
      row.getCell("endereco").alignment = { wrapText: true, vertical: "middle" };
      row.getCell("linkLocalizacao").alignment = { wrapText: true };
      row.getCell("latitude").alignment = { horizontal: "center" };
      row.getCell("longitude").alignment = { horizontal: "center" };
      row.getCell("nivelDoMar").alignment = { horizontal: "center" };
    }

    // Inserir imagens na tabela
    for (let i = 0; i < imoveis.length; i++) {
      const item = imoveis[i];
      const rowIndex = tableStartRow + 1 + i;

      if (!item.imagem) continue;

      const fetched = await fetchImageBuffer(item.imagem);
      if (!fetched) continue;

      const { buffer, ext } = fetched;
      const imageId = workbook.addImage({ buffer, extension: ext });

      sheet.addImage(imageId, {
        tl: { col: 0.2, row: rowIndex - 1 + 0.1 },
        ext: { width: 120, height: 80 },
        editAs: "oneCell",
      });
    }

    // Bordas leves na tabela
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber >= tableStartRow) {
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFD0D0D0" } },
            left: { style: "thin", color: { argb: "FFD0D0D0" } },
            bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
            right: { style: "thin", color: { argb: "FFD0D0D0" } },
          };
        });
      }
    });

    // Resposta final
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