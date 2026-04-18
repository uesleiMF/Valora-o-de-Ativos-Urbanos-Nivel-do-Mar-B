import express from "express";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = express.Router();

// 🔒 Emails permitidos (com proteção contra erro)
const emailsPermitidos = (process.env.EMAILS_PERMITIDOS || "")
  .split(",")
  .map(e => e.toLowerCase().trim())
  .filter(Boolean);


// ==================== REGISTER ====================
router.post("/register", async (req, res) => {
  try {
    const { nome, email, senha, usuario } = req.body;

    const usuarioFinal = usuario || nome;

    if (!usuarioFinal || !email || !senha) {
      return res.status(400).json({
        message: "Preencha todos os campos"
      });
    }

    if (senha.length < 6) {
      return res.status(400).json({
        message: "Senha deve ter pelo menos 6 caracteres"
      });
    }

    const emailNormalizado = email.toLowerCase().trim();

    // 🔒 bloqueia cadastro
    if (!emailsPermitidos.includes(emailNormalizado)) {
      return res.status(403).json({
        message: "Cadastro não permitido"
      });
    }

    const existingUser = await User.findOne({
      $or: [
        { email: emailNormalizado },
        { usuario: usuarioFinal }
      ]
    });

    if (existingUser) {
      return res.status(400).json({
        message: "Email ou usuário já cadastrado"
      });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const newUser = new User({
      usuario: usuarioFinal,
      nome: nome || usuarioFinal,
      email: emailNormalizado,
      senha: senhaHash,
    });

    await newUser.save();

    res.status(201).json({
      message: "Usuário cadastrado com sucesso!",
      user: {
        id: newUser._id,
        nome: newUser.nome,
        email: newUser.email,
      }
    });

  } catch (error) {
    console.error("Erro no register:", error);
    res.status(500).json({
      message: "Erro no cadastro"
    });
  }
});


// ==================== LOGIN ====================
router.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({
        message: "Email e senha são obrigatórios"
      });
    }

    const emailNormalizado = email.toLowerCase().trim();

    // 🔒 bloqueia login
    if (!emailsPermitidos.includes(emailNormalizado)) {
      return res.status(403).json({
        message: "Acesso não autorizado"
      });
    }

    const user = await User.findOne({ email: emailNormalizado });

    if (!user) {
      return res.status(404).json({
        message: "Usuário não encontrado"
      });
    }

    const senhaValida = await bcrypt.compare(senha, user.senha);

    if (!senhaValida) {
      return res.status(401).json({
        message: "Senha inválida"
      });
    }

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      user: {
        id: user._id,
        nome: user.nome,
        email: user.email,
      },
      token
    });

  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({
      message: "Erro no login"
    });
  }
});

export default router;