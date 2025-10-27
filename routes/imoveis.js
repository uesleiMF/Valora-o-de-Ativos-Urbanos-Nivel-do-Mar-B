import express from "express";
import multer from "multer";
import { listarImoveis, criarImovel } from "../controllers/imoveisController.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.get("/", listarImoveis);
router.post("/", upload.single("imagem"), criarImovel);

export default router;