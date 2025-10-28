import Imovel from "../models/Imovel.js";
import cloudinary from "../config/cloudinaryConfig.js";
import fs from "fs";

// Função para calcular valor previsto considerando anos e risco
const calcularValorPrevisto = (valorAtual, nivelDoMar, anos) => {
  let fatorRisco = 1;

  if (nivelDoMar >= 4) fatorRisco = 0.8;
  else if (nivelDoMar >= 2) fatorRisco = 0.9;
  else fatorRisco = 0.95;

  const taxaAnual = 0.03; // 3% de valorização anual
  const valorPrevisto = valorAtual * fatorRisco * Math.pow(1 + taxaAnual, anos);

  return Math.round(valorPrevisto);
};

export const listarImoveis = async (req, res) => {
  try {
    const imoveis = await Imovel.find();
    const imoveisComRisco = imoveis.map(i => ({
      ...i._doc,
      risco: i.nivelDoMar >= 4 ? "Alto" : i.nivelDoMar >= 2 ? "Médio" : "Baixo",
      valorPrevisto5: calcularValorPrevisto(i.valorAtual, i.nivelDoMar, 5),
      valorPrevisto10: calcularValorPrevisto(i.valorAtual, i.nivelDoMar, 10),
      valorPrevisto20: calcularValorPrevisto(i.valorAtual, i.nivelDoMar, 20)
    }));
    res.json(imoveisComRisco);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const criarImovel = async (req, res) => {
  try {
    const { titulo, endereco, latitude, longitude, nivelDoMar, valorAtual, linkLocalizacao } = req.body;
    let imagemUrl = "";

    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, { folder: "imoveis" });
      imagemUrl = result.secure_url;
      fs.unlink(req.file.path, ()=>{});
    }

    const imovel = new Imovel({
      titulo,
      endereco,
      latitude: Number(latitude),
      longitude: Number(longitude),
      nivelDoMar: Number(nivelDoMar),
      valorAtual: Number(valorAtual),
      risco: Number(nivelDoMar) >= 4 ? "Alto" : Number(nivelDoMar) >= 2 ? "Médio" : "Baixo",
      valorPrevisto5: calcularValorPrevisto(Number(valorAtual), Number(nivelDoMar), 5),
      valorPrevisto10: calcularValorPrevisto(Number(valorAtual), Number(nivelDoMar), 10),
      valorPrevisto20: calcularValorPrevisto(Number(valorAtual), Number(nivelDoMar), 20),
      imagem: imagemUrl,
      linkLocalizacao
    });

    await imovel.save();
    res.status(201).json(imovel);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
