import Imovel from "../models/Imovel.js";
import cloudinary from "../config/cloudinaryConfig.js";
import fs from "fs";

// Função para calcular valor previsto
const calcularValorPrevisto = (valorAtual, nivelDoMar) => {
  if (!valorAtual) return 0;
  if(nivelDoMar >= 4) return Math.round(valorAtual * 0.8);
  if(nivelDoMar >= 2) return Math.round(valorAtual * 0.9);
  return Math.round(valorAtual * 0.95);
};

// Listar imóveis
export const listarImoveis = async (req, res) => {
  try {
    const imoveis = await Imovel.find();
    res.json(imoveis);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Criar imóvel
export const criarImovel = async (req, res) => {
  try {
    const { titulo, endereco, latitude, longitude, nivelDoMar, valorAtual } = req.body;
    let imagemUrl = "";

    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, { folder: "imoveis" });
      imagemUrl = result.secure_url;
      fs.unlink(req.file.path, () => {});
    }

    const valorPrevisto = calcularValorPrevisto(Number(valorAtual), Number(nivelDoMar));
    const risco = Number(nivelDoMar) >= 4 ? "Alto" : Number(nivelDoMar) >= 2 ? "Médio" : "Baixo";
    const linkLocalizacao = `https://www.google.com/maps?q=${latitude},${longitude}`;

    const imovel = new Imovel({
      titulo,
      endereco,
      latitude: String(latitude),
      longitude: String(longitude),
      nivelDoMar: String(nivelDoMar),
      valorAtual: String(valorAtual),
      valorPrevisto,
      risco,
      imagem: imagemUrl,
      linkLocalizacao
    });

    await imovel.save();
    res.status(201).json(imovel);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
