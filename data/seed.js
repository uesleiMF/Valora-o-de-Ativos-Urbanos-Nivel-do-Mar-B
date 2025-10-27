import mongoose from "mongoose";
import dotenv from "dotenv";
import Imovel from "../models/Imovel.js";

dotenv.config();

const imoveis = [
  { titulo: "Apartamento Praça da República", endereco: "Praça da República, Belém", latitude: -1.456, longitude: -48.502, nivelDoMar: 1.8, valorAtual: 500000, imagem: "" },
  { titulo: "Casa Umarizal", endereco: "Umarizal, Belém", latitude: -1.447, longitude: -48.485, nivelDoMar: 3.2, valorAtual: 750000, imagem: "" },
  { titulo: "Cobertura Batista Campos", endereco: "Batista Campos, Belém", latitude: -1.443, longitude: -48.493, nivelDoMar: 4.5, valorAtual: 1200000, imagem: "" },
  { titulo: "Apartamento Pedreira", endereco: "Pedreira, Belém", latitude: -1.472, longitude: -48.512, nivelDoMar: 2.5, valorAtual: 650000, imagem: "" },
  { titulo: "Casa Marco", endereco: "Marco, Belém", latitude: -1.424, longitude: -48.495, nivelDoMar: 1.5, valorAtual: 450000, imagem: "" },
  { titulo: "Apartamento Reduto", endereco: "Reduto", latitude: -1.450, longitude: -48.520, nivelDoMar: 2.8, valorAtual: 550000, imagem: "" },
  { titulo: "Casa Guamá", endereco: "Guamá", latitude: -1.500, longitude: -48.460, nivelDoMar: 3.5, valorAtual: 700000, imagem: "" },
  { titulo: "Cobertura Nazaré", endereco: "Nazaré", latitude: -1.460, longitude: -48.500, nivelDoMar: 4.2, valorAtual: 1100000, imagem: "" },
  { titulo: "Apartamento Jurunas", endereco: "Jurunas", latitude: -1.430, longitude: -48.490, nivelDoMar: 1.9, valorAtual: 480000, imagem: "" },
  { titulo: "Casa Souza", endereco: "Souza", latitude: -1.470, longitude: -48.510, nivelDoMar: 2.2, valorAtual: 600000, imagem: "" },
  { titulo: "Apartamento Cidade Velha", endereco: "Cidade Velha", latitude: -1.450, longitude: -48.500, nivelDoMar: 1.6, valorAtual: 520000, imagem: "" },
  { titulo: "Casa Cremação", endereco: "Cremação", latitude: -1.480, longitude: -48.530, nivelDoMar: 2.9, valorAtual: 650000, imagem: "" },
  { titulo: "Cobertura Condor", endereco: "Condor", latitude: -1.440, longitude: -48.495, nivelDoMar: 4.0, valorAtual: 1250000, imagem: "" },
  { titulo: "Apartamento Telégrafo", endereco: "Telégrafo", latitude: -1.455, longitude: -48.505, nivelDoMar: 3.1, valorAtual: 700000, imagem: "" },
  { titulo: "Casa São Brás", endereco: "São Brás", latitude: -1.460, longitude: -48.515, nivelDoMar: 2.0, valorAtual: 580000, imagem: "" },
  { titulo: "Apartamento Fátima", endereco: "Fátima", latitude: -1.465, longitude: -48.525, nivelDoMar: 3.8, valorAtual: 800000, imagem: "" },
  { titulo: "Casa Marco II", endereco: "Marco II", latitude: -1.426, longitude: -48.498, nivelDoMar: 1.7, valorAtual: 460000, imagem: "" },
  { titulo: "Cobertura Batista Campos II", endereco: "Batista Campos", latitude: -1.442, longitude: -48.490, nivelDoMar: 4.3, valorAtual: 1300000, imagem: "" },
  { titulo: "Apartamento Guamá II", endereco: "Guamá", latitude: -1.502, longitude: -48.462, nivelDoMar: 3.6, valorAtual: 720000, imagem: "" },
  { titulo: "Casa Pedreira II", endereco: "Pedreira II", latitude: -1.473, longitude: -48.515, nivelDoMar: 2.6, valorAtual: 660000, imagem: "" }
];

const calcularValorPrevisto = (valorAtual, nivelDoMar) => {
  if(nivelDoMar >=4) return Math.round(valorAtual*0.8);
  if(nivelDoMar >=2) return Math.round(valorAtual*0.9);
  return Math.round(valorAtual*0.95);
};

const seedDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB conectado para seed!");

    await Imovel.deleteMany({});
    console.log("Imóveis antigos removidos");

    for (let imovel of imoveis) {
      const valorPrevisto = calcularValorPrevisto(imovel.valorAtual, imovel.nivelDoMar);
      const risco = imovel.nivelDoMar >=4 ? "Alto" : imovel.nivelDoMar >=2 ? "Médio" : "Baixo";
      await Imovel.create({ ...imovel, valorPrevisto, risco });
    }

    console.log("Seed completo com 20 imóveis!");
    mongoose.connection.close();
  } catch (err) {
    console.error(err);
    mongoose.connection.close();
  }
};

seedDB();