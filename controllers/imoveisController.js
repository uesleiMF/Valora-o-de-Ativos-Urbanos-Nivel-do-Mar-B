import Imovel from "../models/Imovel.js";
import cloudinary from "../config/cloudinaryConfig.js";
import fs from "fs";

// ===============================
// FUNÇÕES AUXILIARES
// ===============================
const calcularRisco = (nivelDoMar) => {
  if (nivelDoMar >= 4) return "Alto";
  if (nivelDoMar >= 2) return "Médio";
  return "Baixo";
};

const calcularValorPrevisto = (valorAtual, nivelDoMar) => {
  if (nivelDoMar >= 4) return Math.round(valorAtual * 0.8);
  if (nivelDoMar >= 2) return Math.round(valorAtual * 0.9);
  return Math.round(valorAtual * 0.95);
};

// ===============================
// LISTAR IMÓVEIS
// ===============================
export const listarImoveis = async (req, res) => {
  try {
    const imoveis = await Imovel.find().sort({ createdAt: -1 });
    res.json(imoveis);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao listar imóveis" });
  }
};

// ===============================
// CRIAR IMÓVEL
// ===============================
export const criarImovel = async (req, res) => {
  try {
    const {
      titulo,
      tipo,
      endereco,
      latitude,
      longitude,
      nivelDoMar,
      valorAtual,
      linkLocalizacao,
    } = req.body;

    // 🔒 validação básica
    if (!titulo || !tipo || !endereco) {
      return res.status(400).json({ error: "Campos obrigatórios faltando" });
    }

    let imagemUrl = "";

    // ===============================
    // UPLOAD CLOUDINARY
    // ===============================
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "imoveis",
      });
      imagemUrl = result.secure_url;
      fs.unlink(req.file.path, () => {});
    }

    const nivel = Number(nivelDoMar);
    const valor = Number(valorAtual);

    const novoImovel = await Imovel.create({
      titulo,
      tipo,
      endereco,
      latitude: String(latitude),
      longitude: String(longitude),
      nivelDoMar: nivel,
      valorAtual: valor,
      risco: calcularRisco(nivel),
      valorPrevisto: calcularValorPrevisto(valor, nivel),
      imagem: imagemUrl,
      linkLocalizacao,
    });

    res.status(201).json(novoImovel);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar imóvel" });
  }
};
