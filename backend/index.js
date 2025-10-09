import express from "express";
// const express = require('express');
import { google } from "googleapis";
// import { GoogleAuth } from "google-auth-library";
import * as dotenv from "dotenv";

dotenv.config({path: '../.env'});

const app = express();

//we only need read access
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

let auth_status = "Authorisation succcess.";

//project_id and backend port are optional env variables
if (!process.env.HIVECATER_GOOGLE_CLIENT_EMAIL || !process.env.HIVECATER_GOOGLE_PRIVATE_KEY) {
    //throw new Error
    auth_status = "ERROR: Missing Google service account credentials in environment variables.";
    console.error(auth_status);
}

let formatted_private_key = process.env.HIVECATER_GOOGLE_PRIVATE_KEY;
if(process.env.HIVECATER_GOOGLE_PRIVATE_KEY)
{
    formatted_private_key = formatted_private_key.replace(/\\n/g, "\n");
}

const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.HIVECATER_GOOGLE_CLIENT_EMAIL,
        private_key: formatted_private_key,
        project_id: process.env.HIVECATER_GOOGLE_PROJECT_ID,
    },
    scopes: SCOPES,
});

const sheets = google.sheets({ version: "v4", auth });

const backend_port= process.env.VITE_HIVECATER_BACKEND_PORT || 4000;
const backend_host= process.env.VITE_HIVECATER_BACKEND_HOST || "localhost";

const api_url = `http://${backend_host}:${backend_port}/api/sheets`;
const greeting_message = `Backend running on port ${backend_port}, access the raw Google Sheets data by going to <a href="${api_url}">${api_url}</a>`;

// basic greeting message
app.get('/', (req, res) => {
    res.send(greeting_message + '</br></br>' + auth_status)
})

let api_status = "API loaded successfully.";    //should never display

app.get("/api/sheets", async (req, res) => {

    if(!process.env.HIVECATER_SPREADSHEETIDS)
    {
        res.send("WARNING: no spreadsheet ids found in the environment, or incorrectly formatted");
        return;
    }

    if(!process.env.HIVECATER_SHEETNAMES)
    {
        res.send("WARNING: no spreadsheet names found in the environment, or incorrectly formatted");
        return;
    }

    let spreadsheet_ids = JSON.parse(process.env.HIVECATER_SPREADSHEETIDS);
    let sheet_names = JSON.parse(process.env.HIVECATER_SHEETNAMES);

    try {
        const spreadsheetId = spreadsheet_ids[0];
        const range = sheet_names[0];

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });

        res.header("Access-Control-Allow-Origin", "http://localhost:5173");
        res.json(response.data.values);
    } catch (err) {
        api_status = "ERROR: Failed to read Google Sheets. Check the spreadsheet ID/s and sheet name/s in the environment";
        // console.error(api_status, err);
        res.status(500).send(api_status);
    }
});

app.listen(backend_port, () => {
    console.log(greeting_message);
});