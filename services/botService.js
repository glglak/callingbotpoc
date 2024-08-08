const { ManagedIdentityCredential } = require('@azure/identity');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const jwt = require('jsonwebtoken');
const MediaService = require('./mediaService');
const SpeechService = require('./speechService');

class BotService {
    constructor() {
        const userAssignedClientId = process.env.USER_ASSIGNED_CLIENT_ID;
        this.credential = new ManagedIdentityCredential(userAssignedClientId);
        this.mediaService = new MediaService();
        this.speechService = new SpeechService();
    }

    async getAccessToken() {
        const token = await this.credential.getToken("https://graph.microsoft.com/.default");

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

    async createSubscription() {
        const accessToken = await this.getAccessToken();
        const notificationUrl = process.env.NOTIFICATION_URL;

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

    async interceptCallMedia(callId) {
        try {
            const accessToken = await this.getAccessToken();

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

            // Process the call media
            const audioStream = callData.mediaStreams.find(stream => stream.type === 'audio');
            if (audioStream) {
                const transcript = await this.speechService.convertSpeechToText(audioStream);
                console.log('Transcript:', transcript);
            }
        } catch (error) {
            console.error('Error intercepting call media:', error);
        }
    }
}

module.exports = BotService;
