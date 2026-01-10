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
// FUNÇÃO PARA CARREGAR IMAGENS
// ===============================
async function fetchImageBuffer(source) {
  if (!source) return null;

  if (/^https?:\/\//i.test(source)) {
    try {
      const response = await axios.get(source, {
        responseType: "arraybuffer",
        timeout: 15000,
      });
      const contentType = response.headers["content-type"] || "image/png";
      let ext = "png";
      if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpeg";
      return { buffer: Buffer.from(response.data), ext };
    } catch {
      return null;
    }
  }

  try {
    let localPath = path.join(process.cwd(), "uploads", path.basename(source));
    if (source.includes("uploads")) localPath = path.join(process.cwd(), source);
    const buffer = await fs.readFile(localPath);
    const ext =
      path.extname(localPath).slice(1).toLowerCase() === "jpg"
        ? "jpeg"
        : path.extname(localPath).slice(1) || "png";
    return { buffer, ext };
  } catch {
    return null;
  }
}

// ===============================
// ROTA EXCEL
// ===============================
router.get("/", async (req, res) => {
  try {
    const imoveis = await Imovel.find().lean();
    if (!imoveis.length) {
      return res.status(404).json({ error: "Nenhum imóvel cadastrado." });
    }

    // ===============================
    // BUSCAR DADOS CLIMÁTICOS
    // ===============================
    const climaRes = await axios.get(
      "https://valora-o-de-ativos-urbanos-nivel-do-mar-b.onrender.com/api/climate/belem"
    );
    const clima = climaRes.data;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Valora Ativos Urbanos";
    workbook.created = new Date();

    // =====================================================
    // ABA 1 — IMÓVEIS (SEU CÓDIGO ORIGINAL)
    // =====================================================
    const sheet = workbook.addWorksheet("Imóveis");

    sheet.mergeCells("A1:H2");
    sheet.getCell("A1").value =
      "Relatório de Imóveis – Risco de Elevação do Nível do Mar";
    sheet.getCell("A1").font = { size: 20, bold: true };
    sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 60;

    sheet.mergeCells("A3:H3");
    sheet.getCell("A3").value = `Gerado em: ${new Date().toLocaleString(
      "pt-BR",
      { timeZone: "America/Sao_Paulo" }
    )}`;
    sheet.getCell("A3").alignment = { horizontal: "center" };

    const riscoCount = { Baixo: 0, Médio: 0, Alto: 0 };
    imoveis.forEach((i) => riscoCount[i.risco || "Baixo"]++);

    sheet.mergeCells("A5:C5");
    sheet.getCell("A5").value = "Distribuição por Nível de Risco";
    sheet.getCell("A5").font = { bold: true, size: 14 };

    sheet.getRow(6).values = ["Risco", "Quantidade", "Porcentagem"];
    sheet.getRow(6).font = { bold: true };

    let resumoRow = 7;
    ["Baixo", "Médio", "Alto"].forEach((r) => {
      const qtd = riscoCount[r];
      if (qtd > 0) {
        sheet.getRow(resumoRow).values = [
          r,
          qtd,
          qtd / imoveis.length,
        ];
        sheet.getCell(`C${resumoRow}`).numFmt = "0.00%";
        resumoRow++;
      }
    });

    const tableStartRow = resumoRow + 3;

    sheet.getRow(tableStartRow).values = [
      "Foto",
      "Título",
      "Endereço",
      "Latitude",
      "Longitude",
      "Nível do Mar (cm)",
      "Valor Atual (R$)",
      "Link",
    ];
    sheet.getRow(tableStartRow).font = { bold: true };

    sheet.columns = [
      { width: 18 },
      { width: 35 },
      { width: 45 },
      { width: 15 },
      { width: 15 },
      { width: 18 },
      { width: 22 },
      { width: 40 },
    ];

    const imagePromises = [];

    imoveis.forEach((item, index) => {
      const rowIndex = tableStartRow + 1 + index;
      sheet.getRow(rowIndex).values = [
        "",
        item.titulo,
        item.endereco,
        item.latitude,
        item.longitude,
        item.nivelDoMar,
        item.valorAtual,
        item.linkLocalizacao ||
          `https://www.google.com/maps?q=${item.latitude},${item.longitude}`,
      ];

      if (item.imagem) {
        imagePromises.push(
          fetchImageBuffer(item.imagem).then((img) => {
            if (img) {
              const id = workbook.addImage({
                buffer: img.buffer,
                extension: img.ext,
              });
              sheet.addImage(id, {
                tl: { col: 0.2, row: rowIndex - 1 },
                ext: { width: 120, height: 80 },
              });
            }
          })
        );
      }
    });

    await Promise.all(imagePromises);

    // =====================================================
    // ABA 2 — CLIMA
    // =====================================================
    const climaSheet = workbook.addWorksheet("Clima");

    climaSheet.columns = [
      { header: "Campo", width: 35 },
      { header: "Valor", width: 40 },
    ];

    climaSheet.addRows([
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

    climaSheet.getRow(1).font = { bold: true };

    // =====================================================
    // ABA 3 — BASE CIENTÍFICA
    // =====================================================
    const obsSheet = workbook.addWorksheet("Base Científica");

    obsSheet.columns = [{ width: 110 }];
    obsSheet.addRows([
      [
        "As projeções apresentadas são baseadas nos relatórios do IPCC (AR6), NASA e NOAA.",
      ],
      [
        "A elevação média global do nível do mar pode variar entre 15 cm e 35 cm até 2050.",
      ],
      [
        "Em cidades costeiras como Belém, fatores locais como marés, drenagem urbana e subsidência do solo ampliam os impactos.",
      ],
      ["Fontes: IPCC • NASA • NOAA • ONU / PNUD"],
    ]);

    obsSheet.eachRow((row) => {
      row.height = 35;
      row.alignment = { wrapText: true, vertical: "middle" };
    });

    // ===============================
    // DOWNLOAD
    // ===============================
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=relatorio_imoveis_nivel_do_mar.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao gerar relatório Excel." });
  }
});

export default router;
