import express from "express";
const router = express.Router();

router.get("/belem", (req, res) => {
  res.json({
    cidade: "Belém",
    nivelAtualCm: 0,
    projecao2030Cm: {
      min: 8,
      max: 15
    },
    projecao2050Cm: {
      min: 15,
      max: 35
    },
    risco: "Alto",
    fonte: "IPCC AR6 / NASA / NOAA",
    dataAtualizacao: "2025-01-05"
  });
});

export default router;
