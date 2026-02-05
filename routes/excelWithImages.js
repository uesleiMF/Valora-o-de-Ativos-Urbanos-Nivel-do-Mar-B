import express from "express";
import ExcelJS from "exceljs";
import fs from "fs/promises";
import path from "path";
import axios from "axios";
import QRCode from "qrcode";
import Imovel from "../models/Imovel.js";

const router = express.Router();
const METROS_PARA_CM = 100;

// Configuração climática (mova pra um arquivo separado se quiser, ex: config/clima.js)
const CLIMA_CONFIG = {
  cidade: "Belém",
  nivelAtualCm: 30,
  projecao2030Cm: { min: 38, max: 45 },
  projecao2050Cm: { min: 45, max: 65 },
  risco: "Alto",
  fonte: "IPCC AR6 • NASA • NOAA",
  dataAtualizacao: "2025-01-05",
};

// Função pra buscar buffer de imagem (local ou remota)
async function fetchImageBuffer(source) {
  if (!source) return null;
  if (/^https?:\/\//i.test(source)) {
    try {
      const res = await axios.get(source, { responseType: "arraybuffer", timeout: 20000 });
      return { buffer: Buffer.from(res.data), ext: "png" };
    } catch {
      return null;
    }
  }
  try {
    const localPath = path.resolve(process.cwd(), source.startsWith("uploads/") ? source : `uploads/${source}`);
    const buffer = await fs.readFile(localPath);
    const ext = path.extname(localPath).toLowerCase().slice(1);
    return { buffer, ext: ext === "jpg" || ext === "jpeg" ? "jpeg" : "png" };
  } catch {
    return null;
  }
}

// Cálculo de nível do mar
function calcularNivelPorAno(imovel, ano) {
  const baseCm = Math.round((Number(imovel.nivelDoMar) || 0) * METROS_PARA_CM);
  if (ano === 2030) return baseCm + 15;
  if (ano === 2050) return baseCm + 35;
  return baseCm; // 2025
}

// Texto de risco
function getRiscoTexto(cm) {
  if (cm >= 490) return "Alto";
  if (cm >= 190) return "Médio";
  return "Baixo";
}

// Valor futuro mais realista (depreciação por risco)
function calcularValorFuturo(valorAtual, risco, anos = 10) {
  const fator = {
    Alto: 0.75,   // -25%
    Médio: 0.90,  // -10%
    Baixo: 1.12,  // +12%
  }[risco] || 1.0;
  return Math.round((valorAtual || 0) * fator);
}

// Limpeza de strings (remove quebras e trim)
function cleanString(str) {
  return String(str || "").trim().replace(/\n/g, " ").replace(/\s+/g, " ");
}

router.get("/", async (req, res) => {
  try {
    // Filtro opcional por query (ex: ?cidade=belem)
    const query = req.query.cidade ? { cidade: new RegExp(req.query.cidade, "i") } : {};
    let imoveis = await Imovel.find(query).lean();
    if (!imoveis.length) return res.status(404).json({ error: "Nenhum imóvel encontrado." });

    // Limpeza de dados
    imoveis = imoveis.map(imovel => ({
      ...imovel,
      titulo: cleanString(imovel.titulo),
      endereco: cleanString(imovel.endereco),
      tipo: cleanString(imovel.tipo), // Assumindo que tem campo 'tipo'
    }));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Valora Ativos Urbanos";

    // Resumo Climático
    const clima = CLIMA_CONFIG;
    const resumo = workbook.addWorksheet("Resumo Climático");
    resumo.columns = [
      { header: "Item", key: "item", width: 35 },
      { header: "Valor", key: "valor", width: 50 },
    ];
    resumo.addRows([
      { item: "Cidade", valor: clima.cidade },
      { item: "Nível do mar atual (cm)", valor: clima.nivelAtualCm },
      { item: "Projeção 2030 (cm)", valor: `${clima.projecao2030Cm.min} – ${clima.projecao2030Cm.max}` },
      { item: "Projeção 2050 (cm)", valor: `${clima.projecao2050Cm.min} – ${clima.projecao2050Cm.max}` },
      { item: "Risco", valor: clima.risco },
      { item: "Fonte", valor: clima.fonte },
      { item: "Atualização", valor: clima.dataAtualizacao },
    ]);
    resumo.getRow(1).font = { bold: true };
    resumo.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    resumo.eachRow((row, index) => {
      row.alignment = { vertical: "middle", horizontal: index === 1 ? "center" : "left", wrapText: true };
      row.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });

    // Base Científica
    const base = workbook.addWorksheet("Base Científica");
    const textoBase = `
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
    base.mergeCells("A1:B12");
    base.getCell("A1").value = textoBase;
    base.getCell("A1").alignment = { wrapText: true, vertical: "top", horizontal: "left" };
    base.getRow(1).height = 180;

    // Função pra criar abas de imóveis
    async function criarAbaImoveis(nome, ano) {
      const sheet = workbook.addWorksheet(nome);
      sheet.columns = [
        { header: "Foto", width: 25 },
        { header: "Título", width: 30 },
        { header: "Tipo", width: 20 },
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
      sheet.views = [{ state: "frozen", ySplit: 1 }]; // Congelar cabeçalho

      // Processar imóveis em paralelo pra performance
      const promises = imoveis.map(async (imovel, i) => {
        try {
          const rowIndex = i + 2;
          const nivelCm = calcularNivelPorAno(imovel, ano);
          const risco = getRiscoTexto(nivelCm);
          const valorAtual = Number(imovel.valorAtual) || 0;
          const valorPrevisto10 = calcularValorFuturo(valorAtual, risco);

          sheet.getRow(rowIndex).height = 110;
          sheet.getRow(rowIndex).alignment = { vertical: "middle", horizontal: "left", wrapText: true };

          // Escrever célula por célula
          sheet.getCell(`B${rowIndex}`).value = imovel.titulo;
          sheet.getCell(`C${rowIndex}`).value = imovel.tipo;
          sheet.getCell(`D${rowIndex}`).value = imovel.endereco;
          sheet.getCell(`E${rowIndex}`).value = Number(imovel.latitude) || "";
          sheet.getCell(`F${rowIndex}`).value = Number(imovel.longitude) || "";
          sheet.getCell(`G${rowIndex}`).value = nivelCm;
          sheet.getCell(`H${rowIndex}`).value = risco;
          sheet.getCell(`I${rowIndex}`).value = valorAtual;
          sheet.getCell(`J${rowIndex}`).value = valorPrevisto10;
          sheet.getCell(`K${rowIndex}`).value = imovel.latitude && imovel.longitude 
            ? `https://www.google.com/maps?q=${imovel.latitude},${imovel.longitude}` 
            : "";

          // Formatação monetária BR
          sheet.getCell(`I${rowIndex}`).numFmt = '#,##0.00 [$R$-pt-BR]';
          sheet.getCell(`J${rowIndex}`).numFmt = '#,##0.00 [$R$-pt-BR]';

          // Bordas na linha
          sheet.getRow(rowIndex).border = { bottom: { style: "thin" } };

          // Foto
          let imgPromise = null;
          if (imovel.imagem) {
            imgPromise = fetchImageBuffer(imovel.imagem).then(img => {
              if (img) {
                const imgId = workbook.addImage({ buffer: img.buffer, extension: img.ext });
                sheet.addImage(imgId, {
                  tl: { col: 0.05, row: rowIndex - 1 + 0.05 },
                  ext: { width: 180, height: 140 },
                });
              }
            });
          }

          // QR Code
          let qrPromise = null;
          if (imovel.latitude && imovel.longitude) {
            const mapUrl = `https://www.google.com/maps?q=${imovel.latitude},${imovel.longitude}`;
            qrPromise = QRCode.toBuffer(mapUrl, { width: 100, margin: 1 }).then(qrBuffer => {
              const qrId = workbook.addImage({ buffer: qrBuffer, extension: "png" });
              sheet.addImage(qrId, {
                tl: { col: 11.05, row: rowIndex - 1 + 0.05 },
                ext: { width: 100, height: 100 },
              });
            });
          }

          await Promise.all([imgPromise, qrPromise]);
        } catch (err) {
          console.warn(`Erro ao processar imóvel ${imovel._id}: ${err.message}`);
          // Opcional: adicionar linha com erro no sheet
        }
      });

      await Promise.allSettled(promises);
    }

    await criarAbaImoveis("Imóveis - Atual (2025)", 2025);
    await criarAbaImoveis("Imóveis - Projeção 2030", 2030);
    await criarAbaImoveis("Imóveis - Projeção 2050", 2050);

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=relatorio_valora_profissional.xlsx");
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao gerar relatório." });
  }
});

export default router;