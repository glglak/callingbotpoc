const express = require('express');
const router = express.Router();
const BotService = require('../services/botService');

const botService = new BotService();

router.get('/create-subscription', async (req, res) => {
    try {
        const subscriptionId = await botService.createSubscription();
        console.log('Subscription created:', subscriptionId);
        res.status(200).send(`Subscription created with ID: ${subscriptionId}`);
    } catch (error) {
        console.error('Error creating subscription:', error);
        res.status(500).send(`Error creating subscription: ${error.message}`);
    }
});

router.post('/api/notifications', async (req, res) => {
    if (req.query && req.query.validationToken) {
        console.log('Validation request received');
        res.status(200).send(req.query.validationToken);
    } else {
        console.log('Notification received:', JSON.stringify(req.body, null, 2));
        res.status(202).send();

        const notification = req.body.value[0];
        if (notification.resourceData && notification.resourceData.id) {
            const callId = notification.resourceData.id;
            console.log('Call ID:', callId);

            botService.interceptCallMedia(callId).catch(error => {
                console.error('Error intercepting call media:', error);
            });
        }
    }
});

module.exports = router;
