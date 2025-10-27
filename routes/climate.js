import express from "express";
const router = express.Router();

router.get("/belem", (req, res) => {
  res.json({
    cidade: "Belém",
    nivelDoMarAtual: 4.1,
    projecao2030: 4.5,
    projecao2050: 5.0,
    risco: "Alto",
    fonte: "Climate Central / IPCC"
  });
});

export default router;