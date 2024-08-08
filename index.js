const appInsights = require('applicationinsights');
const { ManagedIdentityCredential } = require('@azure/identity');
const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
require('dotenv').config();

(async () => {
    // Initialize Application Insights with connection string
    if (process.env.APPINSIGHTS_CONNECTION_STRING) {
        appInsights.setup(process.env.APPINSIGHTS_CONNECTION_STRING)
            .setInternalLogging(false, true)
            .setSendLiveMetrics(true)
            .setUseDiskRetryCaching(true);
    } else {
        console.error('No connection string provided for Azure Monitor Exporter');
    }

    appInsights.start();

    const app = express();
    app.use(bodyParser.json());

    const userAssignedClientId = process.env.USER_ASSIGNED_CLIENT_ID;
    const notificationUrl = process.env.NOTIFICATION_URL;

    // Use ManagedIdentityCredential for user-assigned managed identity
    const credential = new ManagedIdentityCredential(userAssignedClientId);

    async function getAccessToken() {
        const token = await credential.getToken("https://graph.microsoft.com/.default");

        if (!token) {
            throw new Error('Failed to acquire access token');
        }

        const accessToken = token.token;

        // Debugging: Log the token
        console.log('Access Token:', accessToken);

        // Decode the JWT token to inspect its payload
        const decodedToken = jwt.decode(accessToken, { complete: true });
        console.log('Decoded JWT Token:', JSON.stringify(decodedToken, null, 2));

        return accessToken;
    }

    async function createSubscription(accessToken) {
        const subscription = {
            changeType: "created,updated",
            notificationUrl: notificationUrl,
            resource: "/communications/callRecords",
            expirationDateTime: new Date(Date.now() + 3600 * 1000 * 24).toISOString(), // 24 hours from now
            clientState: "secretClientValue"
        };

        const response = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(subscription)
        });

        const responseBody = await response.text();

        if (!response.ok) {
            console.error(`Failed to create subscription: ${response.statusText}`);
            console.error(`Response Body: ${responseBody}`);
            throw new Error(`Failed to create subscription: ${response.statusText}`);
        }

        const subscriptionData = JSON.parse(responseBody);
        return subscriptionData.id;
    }

    async function interceptCallMedia(callId) {
        try {
            const accessToken = await getAccessToken();

            const response = await fetch(`https://graph.microsoft.com/v1.0/communications/calls/${callId}/media`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const responseBody = await response.text();

            if (!response.ok) {
                console.error(`Failed to get call media: ${response.statusText}`);
                console.error(`Response Body: ${responseBody}`);
                throw new Error(`Failed to get call media: ${response.statusText}`);
            }

            const callData = JSON.parse(responseBody);
            console.log('Call Media:', callData);

            // Process the call media as required
            // e.g., send the media to a speech-to-text service

        } catch (error) {
            console.error('Error intercepting call media:', error);
        }
    }

    app.get('/create-subscription', async (req, res) => {
        try {
            const accessToken = await getAccessToken();
            const subscriptionId = await createSubscription(accessToken);
            console.log('Subscription created:', subscriptionId);
            res.status(200).send(`Subscription created with ID: ${subscriptionId}`);
        } catch (error) {
            console.error('Error creating subscription:', error);
            res.status(500).send(`Error creating subscription: ${error.message}`);
        }
    });

    app.post('/api/notifications', async (req, res) => {
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

                interceptCallMedia(callId).catch(error => {
                    console.error('Error intercepting call media:', error);
                });
            }
        }
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
})();
