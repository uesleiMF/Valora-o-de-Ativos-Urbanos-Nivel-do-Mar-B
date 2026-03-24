import jwt from "jsonwebtoken";

export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // 🔒 Verifica se existe header
  if (!authHeader) {
    return res.status(401).json({ message: "Token não fornecido" });
  }

  // 🔒 Verifica formato Bearer
  const parts = authHeader.split(" ");

  if (parts.length !== 2) {
    return res.status(401).json({ message: "Formato do token inválido" });
  }

  const [scheme, token] = parts;

  if (!/^Bearer$/i.test(scheme)) {
    return res.status(401).json({ message: "Token mal formatado" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔥 salva dados do usuário na requisição
    req.user = decoded;

    console.log("[AUTH] Usuário autenticado:", decoded);

    return next();
  } catch (err) {
    console.error("[AUTH] Erro no token:", err.message);

    return res.status(401).json({
      message: "Token inválido ou expirado",
    });
  }
};