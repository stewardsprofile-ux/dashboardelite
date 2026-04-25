const {
    extractDebitCardPurchase,
    graphGetMessage,
    insertGastoFromPurchase,
    parseMessageId,
    requiredEnv
} = require("./outlook-shared");

module.exports = async function handler(req, res) {
    if (req.query?.validationToken) {
        res.setHeader("content-type", "text/plain");
        res.status(200).send(req.query.validationToken);
        return;
    }

    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }

    try {
        const notifications = Array.isArray(req.body?.value) ? req.body.value : [];
        const clientState = requiredEnv("OUTLOOK_WEBHOOK_CLIENT_STATE");

        // Microsoft needs a quick 202. We process right away, but still avoid slow response formatting.
        const results = [];

        for (const notification of notifications) {
            if (notification.clientState !== clientState) {
                results.push({ ok: false, reason: "invalid_client_state" });
                continue;
            }

            const messageId = parseMessageId(notification);
            if (!messageId) {
                results.push({ ok: false, reason: "missing_message_id" });
                continue;
            }

            const message = await graphGetMessage(messageId);
            const purchase = extractDebitCardPurchase(message);

            if (!purchase) {
                results.push({ ok: true, ignored: true, reason: "not_debit_card_purchase" });
                continue;
            }

            if (!purchase.monto || purchase.monto <= 0) {
                results.push({ ok: false, reason: "invalid_amount", subject: message.subject });
                continue;
            }

            const inserted = await insertGastoFromPurchase(purchase, message);
            results.push({ ok: true, ignored: !inserted.inserted, comercio: purchase.comercio, monto: purchase.monto });
        }

        res.status(202).json({ ok: true, results });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
};
