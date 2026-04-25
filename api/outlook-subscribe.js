const {
    GRAPH_BASE_URL,
    fetchJson,
    getAccessTokenFromRefreshToken,
    getBaseUrl,
    requiredEnv
} = require("./outlook-shared");

module.exports = async function handler(req, res) {
    try {
        const accessToken = await getAccessTokenFromRefreshToken();
        const notificationUrl = process.env.OUTLOOK_WEBHOOK_URL || `${getBaseUrl(req)}/api/outlook-webhook`;

        // Outlook message subscriptions last less than 7 days, so this should be renewed regularly.
        const expirationDateTime = new Date(Date.now() + (6 * 24 * 60 * 60 * 1000)).toISOString();

        const subscription = await fetchJson(`${GRAPH_BASE_URL}/subscriptions`, {
            method: "POST",
            headers: {
                authorization: `Bearer ${accessToken}`,
                "content-type": "application/json"
            },
            body: JSON.stringify({
                changeType: "created",
                notificationUrl,
                resource: "me/mailFolders('Inbox')/messages",
                expirationDateTime,
                clientState: requiredEnv("OUTLOOK_WEBHOOK_CLIENT_STATE"),
                latestSupportedTlsVersion: "v1_2"
            })
        });

        res.status(200).json({
            ok: true,
            subscriptionId: subscription.id,
            resource: subscription.resource,
            expirationDateTime: subscription.expirationDateTime
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
};
