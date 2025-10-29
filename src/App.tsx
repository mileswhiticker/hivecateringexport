import {type JSX, useState} from 'react'
import * as React from "react";
import './App.css'

type backend_json = {
    date_request_obj: date_request;
    daily_results: day[];
    summed_results: [];
    biggest_diet: number;
}

type date_request = {
    date_request: string;
    date_start: string;
    date_end: string;
}

type day = {
    dateStr: string;
    dateObj: string;
}

const STRING_TODAY = "Today's date";
const STRING_ALLDAYS = "All days";
const STRING_DAYRANGE = "Day range";
const STRING_SINGLEDAY = "Single day";

function App() {

    const backend_url = import.meta.env.VITE_HIVECATER_BACKEND_ORIGIN
    const api_url = `${backend_url}/api/sheets`;

    const download_url = `${backend_url}/api/download`;
    const pdf_name = import.meta.env.VITE_PDF_NAME || "hive_catering_2025.pdf";

    const [dietTable, setDietTable] = useState<JSX.Element[]>();
    const [dateHeading, setDateHeading] = useState("Select the desired dates then click the button to continue");
    const [selectedDateType, setDateType] = useState(STRING_TODAY);

    const [inputStartDate, setInputStartDate] = useState("2025-10-10");
    const [inputEndDate, setInputEndDate] = useState("2025-11-10");

    const handleDateRequestChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setDateType(event.target.value);

        // console.log(`handleDateRequestChange() ${event.target.value}`);

        if(event.target.value === STRING_DAYRANGE) {
            //safety checking for date ranges
            const startDate = new Date(inputStartDate);
            const endDate = new Date(inputEndDate);

            //make sure the end date is always at or after the start date
            if(endDate.getTime() < startDate.getTime()){

                //get the date in the right format here
                const monthInt = startDate.getMonth() + 1;
                const monthStr = monthInt < 10 ? `0${monthInt}` : monthInt;
                const dayInt = startDate.getDate();
                const dayStr = dayInt < 10 ? `0${dayInt}` : dayInt;
                const dateStr = `${startDate.getFullYear()}-${monthStr}-${dayStr}`;

                //force the end date to be the same as the start date
                setInputEndDate(dateStr);
                // console.log(`Forcing end date to be: ${dateStr}`);
            }
        }
    };

    const pollButtonDefaultText = "Generate catering data";
    const pollButtonLoadingText = "Please wait, loading...";
    const [pollButtonText, setPollButtonText] = useState(pollButtonDefaultText);

    function pollCateringData(){
        setPollButtonText(pollButtonLoadingText);
        // setDietTable(<div></div>);

        let request_start_date = inputStartDate;
        if(selectedDateType === STRING_TODAY) {
            const todaysDateObject = new Date();
            const todaysDateAsString = todaysDateObject.toISOString().split('T')[0];

            //doesnt resolve immediately so we cant set it here
            // setInputStartDate(todaysDateAsString);
            request_start_date = todaysDateAsString;
        }

        //is the user requesting a specific date range?
        let api_url_query = api_url;
        // console.log(`user is requesting date type: ${selectedDateType}`);
        if(selectedDateType !== STRING_ALLDAYS){
            api_url_query += `?date_start=${request_start_date}`;
            if(selectedDateType === STRING_DAYRANGE) {
                api_url_query += `&date_end=${inputEndDate}`;
            }
        }
        // console.log('user is sending GET request to url: ' + api_url_query);

        fetch(api_url_query)
            .then((res) => res.json())
            .then((values) => processRequestJson(values))
            .catch(console.error);
    }

    const pdfButtonDefaultText = "PDF not ready for download";
    const pdfButtonReadyText = "Download PDF";
    const [pdfButtonText, setPdfButtonText] = useState(pdfButtonDefaultText);

    async function onClickDownloadPdf () {
        try {
            const response = await fetch(download_url, {
                method: "GET",
            });

            if (!response.ok) {
                throw new Error("Failed to download PDF");
            }

            // Convert the response to a Blob (binary large object)
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);

            // Create a temporary link to trigger the browser download
            const link = document.createElement("a");
            link.href = url;
            link.download = pdf_name;
            document.body.appendChild(link);
            link.click();

            // Clean up
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
        }
    }

    function processRequestJson(json: backend_json){

        console.log("Received JSON from backend:",json)

        //construct a subheading showing the date/s for our request
        let newDateHeading = `Catering for: ${json.date_request_obj.date_request}`;

        //customise it a bit further
        if(json.date_request_obj.date_request === "Single day"){
            newDateHeading += ` ${json.date_request_obj.date_start}`;
        } else if(json.date_request_obj.date_request === "Day range"){
            newDateHeading += ` ${json.date_request_obj.date_start} - ${json.date_request_obj.date_end}`;
        }

        //now apply it
        setDateHeading(newDateHeading);

        const tables = [];

        //loop over all rows in the response json to construct our html table
        for(let day_index=0; day_index<json.daily_results.length; day_index++){
            const day_obj = json.daily_results[day_index];
            const dateObj = new Date(day_obj.dateObj);
            const day_name = dateObj.toLocaleDateString('en-AU', { weekday: 'long' });

            const rows = [<tr key={day_index}><td>{day_name} {day_obj.dateStr}</td></tr>];

            for(const diet_pref in day_obj) {
                //skip fields that start with date because we only want diet prefs in the table
                if(diet_pref.substring(0,4) === "date"){
                    continue;
                }

                //skip this field because it needs additional processing (todo)
                if(diet_pref === "dietsAllergens"){
                    continue;
                }

                const num_of_people = Number(day_obj[diet_pref  as keyof typeof day_obj]);
                let hungryFaces = "";
                let faceProgress = 0;
                if(num_of_people > 1) {
                    if(num_of_people <= 3) {
                        hungryFaces += "🤤";
                    } else {
                        const max_faces = 40;
                        // const max_width = 482;
                        const face_quota = json.biggest_diet/max_faces;

                        for(let i=0; i<num_of_people;i++){
                            faceProgress += 1;
                            if(faceProgress >= face_quota){
                                faceProgress -= face_quota;
                                hungryFaces += "🤤";
                            }
                        }
                    }

                    //make sure there is at least one smiley face if there is more than 1 person
                    if(hungryFaces === "")
                    {
                        hungryFaces = "🤤";
                    }
                }

                rows.push(
                    <tr key={diet_pref}>
                        <td className="cellBorder cellDietary"><b>{diet_pref}</b></td>
                        <td className="cellBorder cellNumbers"> {num_of_people}</td>
                        <td className="cellFace">{hungryFaces}</td>
                    </tr>
                );

                //now loop over the allergens and insert them into the table

                for (const allergen in day_obj["dietsAllergens"][diet_pref]){
                    const num_of_people_allergens = day_obj["dietsAllergens"][diet_pref][allergen];
                    rows.push(
                        <tr key={diet_pref + "|" + allergen}>
                            <td className="cellBorder cellDietary">* {allergen}</td>
                            <td className="cellBorder cellNumbers">{num_of_people_allergens}</td>
                            <td className="cellFace"></td>
                        </tr>
                    );
                }
            }
            tables.push(<table key={day_index}><tbody>{rows}</tbody></table>);
        }
        setDietTable(tables);
        setPollButtonText(pollButtonDefaultText);
        setPdfButtonText(pdfButtonReadyText);
    }

  return (
    <>
        <h3>Catering requirements for the Hive at Spring Confest 2025</h3>
        <div className="lineItem"><em>
            <label>
                <input
                    type="radio"
                    name="dateRequestInput"
                    value={STRING_TODAY}
                    checked={selectedDateType === STRING_TODAY}
                    onChange={handleDateRequestChange}
                />
                {STRING_TODAY}
            </label>
            <label>
                <input
                    type="radio"
                    name="dateRequestInput"
                    value={STRING_ALLDAYS}
                    checked={selectedDateType === STRING_ALLDAYS}
                    onChange={handleDateRequestChange}
                />
                {STRING_ALLDAYS}
            </label>
            <label>
                <input
                    type="radio"
                    name="dateRequestInput"
                    value={STRING_SINGLEDAY}
                    checked={selectedDateType === STRING_SINGLEDAY}
                    onChange={handleDateRequestChange}
                />
                {STRING_SINGLEDAY}
            </label>
            <label>
                <input
                    type="radio"
                    name="dateRequestInput"
                    value={STRING_DAYRANGE}
                    checked={selectedDateType === STRING_DAYRANGE}
                    onChange={handleDateRequestChange}
                />
                {STRING_DAYRANGE}
            </label>
        </em></div>

        <div className="lineItem">

        {/* when the user wants all days */}
        <div className={selectedDateType === STRING_ALLDAYS ? "" : "hidden"}><br/></div>

        {/* when the user wants a single day */}
        <div className={selectedDateType === STRING_SINGLEDAY ? "" : "hidden"}><input
            type="date"
            name="event"
            min="2025-10-01"
            max="2025-12-01"
            value={inputStartDate}
            onChange={(e) => setInputStartDate(e.target.value)}
        /></div>

        {/* when the user wants a range of days */}
        <div className={selectedDateType === STRING_DAYRANGE ? "" : "hidden"}>Between <input
            type="date"
            name="event"
            min="2025-10-01"
            max="2025-12-01"
            value={inputStartDate}
            onChange={(e) => setInputStartDate(e.target.value)}
        /> and <input
            type="date"
            name="event"
            min="2025-10-01"
            max="2025-12-01"
            value={inputEndDate}
            onChange={(e) => setInputEndDate(e.target.value)}
        /></div>
        </div>

        <div className="lineItem">
            <button disabled={pollButtonText !== pollButtonDefaultText} onClick={() => pollCateringData()}>
                {pollButtonText}
            </button>
            <button disabled={pdfButtonText === pdfButtonDefaultText} onClick={() => onClickDownloadPdf()}>
                {pdfButtonText}
            </button>
        </div>
        <div className="lineItem"><em>{dateHeading}</em></div>
        <div>{dietTable}</div>
    </>
  )
}

export default App
