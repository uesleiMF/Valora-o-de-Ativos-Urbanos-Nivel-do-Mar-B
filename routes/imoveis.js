import express from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import Imovel from "../models/Imovel.js";
import {
  listarImoveis,
  criarImovel
} from "../controllers/imoveisController.js";
import { authMiddleware } from "../middleware/auth.js";
const router = express.Router();

// Multer (upload temporário)
const upload = multer({ dest: "uploads/" });

/*
  ROTA ➜ GET /api/imoveis
  -----------------------
  Lista imóveis
  Filtro opcional:
  ?tipo=casa | apartamento | terreno | comercial
*/
router.get("/", listarImoveis);

/*
  ROTA ➜ POST /api/imoveis
  ------------------------
  Cria um novo imóvel (com imagem)
*/
router.post("/", upload.single("imagem"), criarImovel);


router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const imovel = await Imovel.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!imovel)
      return res.status(404).json({ message: "Imóvel não encontrado" });

    res.json(imovel);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const imovel = await Imovel.findByIdAndDelete(req.params.id);

    if (!imovel)
      return res.status(404).json({ message: "Imóvel não encontrado" });

    res.json({ message: "Imóvel deletado com sucesso" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
/*
  ROTA ➜ GET /api/imoveis/export
  ------------------------------
  Exporta imóveis para Excel
  (respeita filtro ?tipo=)
*/
router.get("/export", async (req, res) => {
  try {
    const { tipo } = req.query;

    // Filtro opcional por tipo
    const filtro = tipo ? { tipo } : {};

    const imoveis = await Imovel.find(filtro);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Imóveis");

    // Cabeçalho
    sheet.addRow([
      "Título",
      "Tipo",
      "Endereço",
      "Latitude",
      "Longitude",
      "Nível do Mar",
      "Risco",
      "Valor Atual",
      "Valor Previsto (5 anos)",
      "Valor Previsto (10 anos)",
      "Valor Previsto (20 anos)",
      "Link Google Maps"
    ]);

    // Dados
    imoveis.forEach((imovel) => {
      sheet.addRow([
        imovel.titulo,
        imovel.tipo,
        imovel.endereco,
        imovel.latitude,
        imovel.longitude,
        imovel.nivelDoMar,
        imovel.risco,
        imovel.valorAtual,
        imovel.valorPrevisto5 || "",
        imovel.valorPrevisto10 || "",
        imovel.valorPrevisto20 || "",
        `https://www.google.com/maps?q=${imovel.latitude},${imovel.longitude}`
      ]);
    });

    // Headers de download
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
    console.error("Erro ao exportar Excel:", error);
    res.status(500).json({ error: "Erro ao gerar Excel" });
  }
});

export default router;
