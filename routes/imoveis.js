import express from "express";
import multer from "multer";
import { listarImoveis, criarImovel } from "../controllers/imoveisController.js";
import ExcelJS from "exceljs";
import Imovel from "../models/Imovel.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.get("/", listarImoveis);
router.post("/", upload.single("imagem"), criarImovel);

/*  
  ROTA ➜ GET /api/imoveis/export
  ------------------------------
  Exporta todos os imóveis para Excel
*/
router.get("/export", async (req, res) => {
  try {
    const imoveis = await Imovel.find();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Imóveis");

    // Cabeçalho da planilha
    sheet.addRow([
      "Título",
      "Endereço",
      "Latitude",
      "Longitude",
      "Nível do Mar",
      "Valor Atual",
      "Link Google Maps"
    ]);

    // Dados
    imoveis.forEach((imovel) => {
      sheet.addRow([
        imovel.titulo,
        imovel.endereco,
        imovel.latitude,
        imovel.longitude,
        imovel.nivelDoMar,
        imovel.valorAtual,
        `https://www.google.com/maps?q=${imovel.latitude},${imovel.longitude}`
      ]);
    });

    // Configurar o download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=imoveis.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao gerar Excel" });
  }
});

export default router;
