import Imovel from "../models/Imovel.js";
import cloudinary from "../config/cloudinaryConfig.js";
import fs from "fs";

const calcularValorPrevisto = (valorAtual, nivelDoMar) => {
  if (!valorAtual) return 0;
  if(nivelDoMar >= 4) return Math.round(valorAtual*0.8);
  if(nivelDoMar >= 2) return Math.round(valorAtual*0.9);
  return Math.round(valorAtual*0.95);
};

export const listarImoveis = async (req, res) => {
  try {
    const imoveis = await Imovel.find();
    const imoveisComRisco = imoveis.map(i => ({
      ...i._doc,
      risco: i.nivelDoMar >=4 ? "Alto" : i.nivelDoMar >=2 ? "Médio" : "Baixo",
      valorPrevisto: calcularValorPrevisto(i.valorAtual, i.nivelDoMar)
    }));
    res.json(imoveisComRisco);
  } catch(err) {
    res.status(500).json({ message: err.message });
  }
};

export const criarImovel = async (req, res) => {
  try {
    const { titulo, endereco, latitude, longitude, nivelDoMar, valorAtual } = req.body;
    let imagemUrl = "";

    if (req.file) {
      // upload to cloudinary
      const result = await cloudinary.uploader.upload(req.file.path, { folder: "imoveis" });
      imagemUrl = result.secure_url;
      // remove temp file
      fs.unlink(req.file.path, ()=>{});
    }

    const imovel = new Imovel({
      titulo, endereco,
      latitude: Number(latitude),
      longitude: Number(longitude),
      nivelDoMar: Number(nivelDoMar),
      valorAtual: Number(valorAtual),
      valorPrevisto: calcularValorPrevisto(Number(valorAtual), Number(nivelDoMar)),
      risco: Number(nivelDoMar) >=4 ? "Alto" : Number(nivelDoMar) >=2 ? "Médio" : "Baixo",
      imagem: imagemUrl
    });

    await imovel.save();
    res.status(201).json(imovel);
  } catch(err) {
    res.status(500).json({ message: err.message });
  }
};