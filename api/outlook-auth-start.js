const { getRedirectUri, requiredEnv } = require("./outlook-shared");

module.exports = async function handler(req, res) {
    try {
        const params = new URLSearchParams({
            client_id: requiredEnv("MICROSOFT_CLIENT_ID"),
            response_type: "code",
            redirect_uri: getRedirectUri(req),
            response_mode: "query",
            scope: "offline_access User.Read Mail.Read",
            prompt: "consent"
        });

        res.writeHead(302, {
            location: `https://login.microsoftonline.com/${requiredEnv("MICROSOFT_TENANT_ID")}/oauth2/v2.0/authorize?${params}`
        });
        res.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
