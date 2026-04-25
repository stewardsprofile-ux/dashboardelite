const { exchangeCodeForTokens } = require("./outlook-shared");

module.exports = async function handler(req, res) {
    try {
        const { code, error, error_description } = req.query;

        if (error) {
            res.status(400).send(`<pre>${error}: ${error_description || ""}</pre>`);
            return;
        }

        if (!code) {
            res.status(400).send("Missing authorization code.");
            return;
        }

        const tokens = await exchangeCodeForTokens(req, code);
        const refreshToken = tokens.refresh_token || "";

        res.setHeader("content-type", "text/html; charset=utf-8");
        res.status(200).send(`
            <main style="font-family: Arial, sans-serif; max-width: 760px; margin: 40px auto; line-height: 1.5;">
                <h1>Outlook conectado</h1>
                <p>Copia este refresh token y guardalo como variable de entorno en Vercel:</p>
                <pre style="white-space: pre-wrap; padding: 16px; background: #111827; color: #f9fafb; border-radius: 10px;">${refreshToken}</pre>
                <p><strong>Variable:</strong> OUTLOOK_REFRESH_TOKEN</p>
                <p>Despues de guardarlo, redeploy en Vercel y abre <code>/api/outlook-subscribe</code>.</p>
            </main>
        `);
    } catch (err) {
        res.status(500).send(`<pre>${err.message}</pre>`);
    }
};
