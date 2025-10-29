import express from "express";
// const express = require('express');
import { google } from "googleapis";
// import { GoogleAuth } from "google-auth-library";
import * as dotenv from "dotenv";
import PDFDocument from "pdfkit";

dotenv.config({path: '../.env'});

const app = express();

//we only need read access
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
const CUSTOM_DIET_STRING = "I have specific requirements i will let the hive know about";
const OMNI_DIET_STRING = "Will eat anything";
const NO_RESPONSE_STRING = "No response";

let auth_status = "Authorisation success.";

let last_generated_json = null;

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

let last_uuid = 1;
function get_uuid(){
    return last_uuid++;
}

const sheets = google.sheets({ version: "v4", auth });

const backend_origin = process.env.VITE_HIVECATER_BACKEND_ORIGIN || "http://localhost:4000";
const backend_port = process.env.VITE_HIVECATER_BACKEND_PORT || 4000;
const frontend_origin = process.env.VITE_HIVECATER_FRONTEND_ORIGIN || `http://localhost:5000`;
const pdf_name = process.env.VITE_PDF_NAME || "hive_catering_2025.pdf";

const api_url = `${backend_origin}/api/sheets`;
const download_url = `${backend_origin}/api/download`;
const greeting_message = `Backend running at ${backend_port}. Access the raw Google Sheets data by going to <a href="${api_url}">${api_url}</a>
<br/><br/>
Download a generated PDF at <a href="${download_url}">${download_url}</a>`;

function getDateObjectFromStringSlash(dateString) {
    if(typeof dateString != "string"){
        return new Date(2025, 9, 0);
    }
    const [day, month, year] = dateString.split('/').map(Number);
    // month is 0-based in JS Date
    return new Date(year, month - 1, day);
}

// function getDateObjectFromStringDash(dateString) {
//     const [year, month, day] = dateString.split('-').map(Number);
//
//     // month is 0-based in JS Date
//     return new Date(year, month - 1, day)
// }

function getDateStringFromObjectDash(dateObj){

    //get the date in the right format here
    const monthInt = dateObj.getMonth() + 1;
    const monthStr = monthInt < 10 ? `0${monthInt}` : monthInt;
    const dayInt = dateObj.getDate();
    const dayStr = dayInt < 10 ? `0${dayInt}` : dayInt;

    return `${dateObj.getFullYear()}-${monthStr}-${dayStr}`;
}

function sortDailyDietaries(daily_obj){
    const ordered_properties = [];
    const ordered_values = [];
    const new_daily_obj = {};
    let biggest_diet = 0;
    for(const key in daily_obj) {
        //skip fields that start with date because we only want diet prefs in the table
        if (key.substring(0, 4) === "date") {
            new_daily_obj[key] = daily_obj[key];
            continue;
        }

        //if the amount is greater than 1, add it to the end
        //there is a whole bunch of unique dietaries that don't need sorting
        if(daily_obj[key] === 1) {
            ordered_properties.push(key);
            ordered_values.push(1);
            continue;
        }

        const checkval = daily_obj[key];
        if(checkval > biggest_diet) {
            biggest_diet = checkval;
        }

        //sort it in
        let success = false;
        for(let i=0; i<ordered_values.length; i++){
            if(ordered_values[i] <= daily_obj[key]) {

                //insert this one in the order
                ordered_properties.splice(i, 0, key);
                ordered_values.splice(i, 0, daily_obj[key]);
                success = true;

                break;
            }
        }

        //did we find a place for it? if not then put it at the end
        if(!success)
        {
            ordered_properties.push(key);
            ordered_values.push(daily_obj[key]);
        }
    }

    //for debugging
    // daily_obj.ordered_properties = ordered_properties;
    // daily_obj.ordered_values = ordered_values;

    //construct the new object
    for(let i=0; i<ordered_values.length; i++){
        new_daily_obj[ordered_properties[i]] = ordered_values[i];
    }

    new_daily_obj["biggest_diet"] = biggest_diet;

    return new_daily_obj;
}

function parseDietPrefs(person_obj, daily_objs) {
    // console.log("parseDietPrefs()",person_obj);

    const arrival_date = getDateObjectFromStringSlash(person_obj[0]);
    const departure_date = getDateObjectFromStringSlash(person_obj[1]);

    //we need to loop over all dates this person is on site
    let curCheckDate = new Date(arrival_date.getTime());

    while(curCheckDate.getTime() <= departure_date.getTime()) {

        // const curCheckDateStr = getDateStringFromObjectDash(curCheckDate);

        //see if an object for this day already exists
        let cater_day_obj = null;
        for(let i=0; i<daily_objs.length; i++) {
            const check_cater_day_obj = daily_objs[i];

            //is this our desired date?
            if(check_cater_day_obj.dateObj.getTime() === curCheckDate.getTime()) {
                //found it
                cater_day_obj = check_cater_day_obj;
                break;
            }
        }

        //if we didn't find it, create an object to track catering for this date
        if(!cater_day_obj){
            cater_day_obj = {
                dateStr: getDateStringFromObjectDash(curCheckDate),
                dateObj: new Date(curCheckDate.getTime()),
                dietsAllergens: {}
            };
            // cater_day_obj["**** Diets ****"] = "";

            //find the place to add it to the list
            let success = false;
            for(let i=0; i<daily_objs.length; i++) {
                const check_cater_day_obj = daily_objs[i];

                if(check_cater_day_obj.dateObj.getTime() > cater_day_obj.dateObj.getTime()) {
                    daily_objs.splice(i, 0, cater_day_obj);
                    success = true;
                    break;
                }
            }
            if(!success){
                daily_objs.push(cater_day_obj)
            }
            // console.log(cater_day_obj.dateStr);
        }

        //anonymised uuids to track the people on this date for debugging
        // cater_day_obj.people.push(person_obj[7]);

        //grab the diet preference
        let diet_pref = NO_RESPONSE_STRING;
        if(person_obj[2]){
            diet_pref = person_obj[2].trim();
        }

        //treat these all as omnis
        /*if(diet_pref === CUSTOM_DIET_STRING){
            // console.log(person_obj);
            person_obj[2] = OMNI_DIET_STRING;
            diet_pref = OMNI_DIET_STRING;
        }*/
        // if(diet_pref === "Vegan" || diet_pref === "Vegetarian") {
        //     diet_pref = "Vegans and Vegetarians"
        // }
        //is this dietary type already in our summed object?
        if(cater_day_obj[diet_pref]){
            //increase by 1
            cater_day_obj[diet_pref] += 1;
        } else {
            //define a new dietary type
            cater_day_obj[diet_pref] = 1;
            cater_day_obj["dietsAllergens"][diet_pref] = {};
        }

        //does this person have allergens or other dietary requirements?
        if(person_obj[3]) {
            const allergen = person_obj[3].trim();
            //add it to the diets list
            // if(cater_day_obj[person_obj[3]]) {
            //     //increase by 1
            //     cater_day_obj[person_obj[3]] += 1;
            // } else {
            //     //define a new dietary type
            //     cater_day_obj[person_obj[3]] = 1;
            // }

            //does this allergen already exist for this diet?
            if(cater_day_obj["dietsAllergens"][diet_pref][allergen]){
                cater_day_obj["dietsAllergens"][diet_pref][allergen] += 1;
            } else {
                cater_day_obj["dietsAllergens"][diet_pref][allergen] = 1;
            }
        }

        //is this person bringing kids?
        if(person_obj[4])
        {
            // console.log(`found a person with kids: ${person_obj[4]}`);
            const numKids = Number(person_obj[4]);
            if(!isNaN(numKids) && isFinite(numKids) && numKids !== 0){

                // instead of tracking children separately, give them the same diet as their parents
                if(diet_pref !== CUSTOM_DIET_STRING) {
                    cater_day_obj[diet_pref] += numKids;
                } else {
                    cater_day_obj[OMNI_DIET_STRING] += numKids;
                }

                // if(!cater_day_obj["Children"]){
                //     cater_day_obj["Children"] = numKids;
                // } else {
                //     cater_day_obj["Children"] += numKids;
                // }
            }
        }

        //increment the date object by 1 day
        curCheckDate.setDate(curCheckDate.getDate() + 1);
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
        let daily_results = [];
        const date_request = {"date_request": "All days"};

        const response_json = {"date_request_obj": date_request,
            "summed_results": summed_results,
            "daily_results": daily_results,
            "biggest_diet": 0};

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

        //DTE confirmed volunteers
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

                //allergy type
                response1.data.values[i][8],

                //children
                response1.data.values[i][10],

                //uuid
                get_uuid(),

                //name
                // response1.data.values[i][2],

            ];
            latestval++;
            // console.log("parsed_results",parsed_results);

            // if they didn't enter a dietary preference, skip them
            if(!parsed_results[i][2]){
                continue;
            }

            parseDietPrefs(parsed_results[i], daily_results);
        }

        //village confirmed volunteers
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

                //list of allergies
                response2.data.values[i][8],

                //accompanying kids
                response2.data.values[i][6],

                //uuid
                get_uuid(),
            ];
            parseDietPrefs(parsed_results[latestval + i], daily_results);
        }

        const new_daily_results = [];

        //sort the parsed json in case the user is only requesting a subset
        switch(date_request["date_request"]){
            case "Single day":{

                //loop over the generated results to take the ones we want
                for(let i=0;i<daily_results.length;i++){
                    const check_day = daily_results[i];
                    if(check_day.dateStr === date_request["date_start"]){

                        //sort it by number of people
                        const sorted_day_obj = sortDailyDietaries(check_day);

                        //these are ordered so just grab the first one
                        response_json["biggest_diet"] = sorted_day_obj["biggest_diet"];

                        //dont need this any more
                        delete sorted_day_obj["biggest_diet"];

                        //create a new list with just this one
                        new_daily_results.push(sorted_day_obj);

                        //finish here
                        break;
                    }
                }
                break;
            }
            case "Day range": {
                const start_date_obj = new Date(date_request["date_start"]);
                const end_date_obj = new Date(date_request["date_end"]);

                //loop over the generated results to take the ones we want
                for(let i=0;i<daily_results.length;i++){
                    const check_day = daily_results[i];
                    const check_date_obj = new Date(check_day.dateStr);

                    //if this is too early, move to the next one
                    if(check_date_obj.getTime() < start_date_obj.getTime()) {
                        continue;
                    }

                    //if this is too late, we can finish here
                    if(check_date_obj.getTime() > end_date_obj.getTime()) {
                        break;
                    }

                    //sort it by number of people
                    const sorted_day_obj = sortDailyDietaries(check_day);

                    //these are ordered so just grab the first one of the day
                    if(sorted_day_obj["biggest_diet"] > response_json["biggest_diet"]){
                        response_json["biggest_diet"] = sorted_day_obj["biggest_diet"];
                    }

                    //dont need this any more
                    delete sorted_day_obj["biggest_diet"];

                    //add this one to the new list
                    new_daily_results.push(sorted_day_obj);
                }
                break;
            }
            default:{
                for(let i=0;i<daily_results.length;i++) {
                    const check_day = daily_results[i];

                    //sort it by number of people
                    const sorted_day_obj = sortDailyDietaries(check_day);

                    //find the largest dietary type
                    if(sorted_day_obj["biggest_diet"] > response_json["biggest_diet"]){
                        response_json["biggest_diet"] = sorted_day_obj["biggest_diet"];
                    }

                    //dont need this any more
                    delete sorted_day_obj["biggest_diet"];

                    //add this one to the new list
                    new_daily_results.push(sorted_day_obj);
                }
                break;
            }
        }

        //flip the lists
        daily_results = new_daily_results;
        response_json["daily_results"] = daily_results;

        //save this json for pdf generation
        last_generated_json = response_json;

        //set the header to only allow requests from specific origins
        res.header("Access-Control-Allow-Origin", `${frontend_origin}`);

        //send the json back to the user
        res.json(response_json);
    } catch (err) {
        api_status = "ERROR: Failed to read Google Sheets. Check the spreadsheet ID/s and sheet name/s in the environment |";
        console.error(api_status, err);
        res.status(500).send(err);
    }
});

app.get("/api/download", (req, res) => {

    // console.log(`Beginning PDF generation...`, last_generated_json);

    res.header("Access-Control-Allow-Origin", `${frontend_origin}`);

    if(!last_generated_json){
        res.send("No data loaded from google sheets, unable to generate PDF");
        return;
    }
    // console.log(last_generated_json);

    function drawTable(doc, data, startX, startY, colWidths, rowHeight = 25, biggest_diet) {
        data.forEach((row, rowIndex) => {
            const y = startY + rowIndex * rowHeight;

            row.forEach((cell, colIndex) => {
                const x = startX + colWidths.slice(0, colIndex).reduce((a, b) => a + b, 0);
                doc.rect(x, y, colWidths[colIndex], rowHeight).stroke();

                if(colIndex === 2) {
                    //draw emojis
                    //cell
                    if(cell > 1) {
                        let num_faces = 1;
                        const max_faces = 12;
                        if(cell > 5) {
                            num_faces = max_faces * cell / biggest_diet;
                        }

                        const faceWidth = 10;
                        for(let j = 0; j < num_faces; j++) {
                            doc.image('../public/hungryface.png', x + j * faceWidth, y + (rowHeight / 2) - (faceWidth / 2), { width: faceWidth });
                        }
                    }
                } else {
                    //regular text
                    console.log(`${typeof cell}`,cell);
                    if(typeof cell === "string" && cell.substring(0,3) === "<b>"){
                        cell = cell.slice(3);
                        doc.fontSize(10).font('Helvetica-Bold').text(cell, x + 5, y + 8, { width: colWidths[colIndex] - 10 });
                    } else {
                        doc.fontSize(10).font('Helvetica').text(cell, x + 5, y + 8, { width: colWidths[colIndex] - 10 });
                    }
                }
            });
        });
    }

    // Create the document
    const doc = new PDFDocument({
        margins: { top: 50, bottom: 50, left: 72, right: 72 }
    });

    // Set headers *before* piping
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${pdf_name}"`);

    // Pipe the PDF into the response
    doc.pipe(res);

    for(let i=0;i<last_generated_json.daily_results.length;i++){
        //info for the current day
        let cur_day_obj = last_generated_json.daily_results[i];

        //generate a page title with day name and date
        const dateObj = new Date(cur_day_obj.dateObj);
        const dayName = dateObj.toLocaleDateString('en-AU', { weekday: 'long' });
        doc.fontSize(30).text(dayName + " " + cur_day_obj.dateStr, { align: "right" });
        // doc.moveDown();

        let tableData = [];
        for(const diet_pref in cur_day_obj) {

            //dont render these
            if(diet_pref.substring(0,4) === "date"){
                continue;
            }

            //render these separately
            if(diet_pref === "dietsAllergens"){
                continue;
            }

            let rowData = [];
            rowData.push(`<b>${diet_pref}`);
            rowData.push(Number(cur_day_obj[diet_pref]));
            rowData.push(Number(cur_day_obj[diet_pref]));

            tableData.push(rowData);

            //now do allergens
            for(const allergen in cur_day_obj["dietsAllergens"][diet_pref]) {

                let rowData_allergen = [];
                rowData_allergen.push(`* ${allergen}`);
                rowData_allergen.push(Number(cur_day_obj["dietsAllergens"][diet_pref][allergen]));
                rowData_allergen.push(Number(cur_day_obj["dietsAllergens"][diet_pref][allergen]));

                tableData.push(rowData_allergen);
            }
        }

        //finally, draw the table
        drawTable(doc, tableData, doc.page.margins.left, 100, [310, 30, 125], 25, last_generated_json["biggest_diet"]);
        const title_font_size = 30;
        // const logo_height = 133;
        const logo_width = 373;

        //add an image of the confest logo
        doc.image('../public/confest-logo.png', doc.page.margins.left, doc.page.margins.top - 10, { width: logo_width / 3 });

        //generate a page title with some informative text
        //make sure it's positioned precisely at the bottom of the page
        const footer_text = "Spring Confest 2025 Hive Catering";
        const height_of_text = doc.fontSize(title_font_size).heightOfString(footer_text, {width: 500});
        doc.fontSize(title_font_size).text(footer_text, doc.page.margins.left, doc.page.height - doc.page.margins.bottom - height_of_text);

        //add a new page if we have more days to export
        if(i < last_generated_json.daily_results.length - 1){
            doc.addPage();
        }
    }
    // console.log('pdf doc.page.margins',doc.page.margins);

    // IMPORTANT: finalize the PDF and end the response
    doc.end();
});

app.listen(backend_port, () => {
    console.log(greeting_message);
});