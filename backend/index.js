import express from "express";
// const express = require('express');
import { google } from "googleapis";
// import { GoogleAuth } from "google-auth-library";
import * as dotenv from "dotenv";

dotenv.config({path: '../.env'});

const app = express();

//we only need read access
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

let auth_status = "Authorisation success.";

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

function getDateObjectFromStringSlash(dateString) {
    const [day, month, year] = dateString.split('/').map(Number);
    // month is 0-based in JS Date
    return new Date(year, month - 1, day);
}

function getDateObjectFromStringDash(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);

    // month is 0-based in JS Date
    return new Date(year, month - 1, day)
}

function parseDietPrefs(person_obj, summed_obj, daily_obj, date_request_obj) {

    //first we need to figure out if this person is onsite for our desired date range
    let count_this_person = false;
    switch(date_request_obj["date_request"]){
        case "All days": {
            count_this_person = true;
            break;
        }
        case "Single day": {
            const arrival_date = getDateObjectFromStringSlash(person_obj[0]);
            const departure_date = getDateObjectFromStringSlash(person_obj[1]);
            const request_date_start = getDateObjectFromStringDash(date_request_obj["date_start"]);

            if(arrival_date.getTime() <= request_date_start.getTime() && departure_date.getTime() >= request_date_start.getTime()){
                count_this_person = true;
            }
            break;
        }
        case "Day range": {
            const arrival_date = getDateObjectFromStringSlash(person_obj[0]);
            const departure_date = getDateObjectFromStringSlash(person_obj[1]);
            const request_date_start = getDateObjectFromStringDash(date_request_obj["date_start"]);
            const request_date_end = getDateObjectFromStringDash(date_request_obj["date_end"]);

            // console.log(`${person_obj[0]} | ${person_obj[1]} | ${date_request_obj["date_start"]} | ${date_request_obj["date_end"]}`);
            // console.log(`${arrival_date} | ${departure_date} | ${request_date_start} | ${request_date_end}`);

            console.log(`${arrival_date.getTime()} | ${request_date_start.getTime()} | ${departure_date.getTime()} | ${request_date_end.getTime()}`);

            if(arrival_date.getTime() <= request_date_start.getTime() && departure_date.getTime() >= request_date_end.getTime()){
                count_this_person = true;
            }
            break;
        }
    }

    if(!count_this_person) {
        //finish early without adding to the summed object
        return;
    }

    //is this deitary type already in our summed objet?
    if(summed_obj[person_obj[2]]){
        //increase by 1
        summed_obj[person_obj[2]] += 1;
    } else {
        //define a new dietary type
        summed_obj[person_obj[2]] = 1;
    }

    //is this person bringing kids?
    if(person_obj[6])
    {
        const numKids = Number(person_obj[6]);
        if(!isNaN(numKids) && isFinite(numKids)){
            if(!summed_obj["Children"]){
                summed_obj["Children"] = numKids;
            } else {
                summed_obj["Children"] += numKids;
            }
        }
    }
}

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
        let spreadsheetId = spreadsheet_ids[0];
        let range = sheet_names[0];

        const response1 = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });

        spreadsheetId = spreadsheet_ids[1];
        range = sheet_names[1];
        const response2 = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });

        //loop over first spreadsheet and parse into desired format
        const parsed_results = {};
        let summed_results = {};
        const daily_results = {};
        const date_request = {"date_request": "All days"};

        //is the user requesting a specific date?
        if(req.query.date_start){
            date_request["date_start"] = req.query.date_start;

            if(req.query.date_end){
                date_request["date_end"] = req.query.date_end;
                date_request["date_request"] = "Day range";
            } else {
                date_request["date_request"] = "Single day";
            }
        }

        // console.log(response1.data.values);
        let latestval = 0;
        for(let i=1;i<response1.data.values.length;i++)
        {
            //only grab the specific data we want from this sheet
            parsed_results[i] = [
                //arrival date (non-normalised format)
                response1.data.values[i][4],

                //departure date (non-normalised format)
                response1.data.values[i][5],

                //food pref
                response1.data.values[i][6],

                //allergy
                response1.data.values[i][7],

                //allergy type
                response1.data.values[i][8],

                //other health concerns
                response1.data.values[i][9],

                //children
                response1.data.values[i][10],
            ];
            latestval++;

            parseDietPrefs(parsed_results[i], summed_results, daily_results, date_request);
        }

        //village volunteers
        for(let i=1;i<response2.data.values.length;i++)
        {
            //skip volunteers that don't want to eat at the hive
            if(response2.data.values[i][4] === "No"){
                continue;
            }

            //only grab the specific data we want from this sheet
            //note: we are reordering these fields to match the order in the first spreadsheet
            parsed_results[latestval + i] = [

                //arrival date (DD/MM/YYYY)
                response2.data.values[i][2],

                //departure date (DD/MM/YYYY)
                response2.data.values[i][3],

                //dietary preferences
                response2.data.values[i][5],

                //allergies (Yes/No)
                response2.data.values[i][7],

                //list of allergies
                response2.data.values[i][8],

                //other dietary requirements/health concerns
                response2.data.values[i][9],

                //accompanying kids
                response2.data.values[i][6],
            ];
            parseDietPrefs(parsed_results[latestval + i], summed_results, daily_results, date_request);
        }

        // const final_json = {...response1.data.values, ...response2.data.values};

        res.header("Access-Control-Allow-Origin", "http://localhost:5173");
        res.json(summed_results);
    } catch (err) {
        api_status = "ERROR: Failed to read Google Sheets. Check the spreadsheet ID/s and sheet name/s in the environment |";
        console.error(api_status, err);
        res.status(500).send(err);
    }
});

app.listen(backend_port, () => {
    console.log(greeting_message);
});