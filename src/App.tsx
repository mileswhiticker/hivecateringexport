import { useState } from 'react'
import * as React from "react";
import './App.css'

function App() {

    const backend_port = import.meta.env.VITE_HIVECATER_BACKEND_PORT || 4000;
    const api_url = `http://localhost:${backend_port}/api/sheets`;

    const [dietTable, setDietTable] = useState(<div></div>);
    const [dateHeading, setDateHeading] = useState("Select the desired dates then click the button to continue");
    const [selectedDateType, setDateType] = useState("All days");

    const [inputStartDate, setInputStartDate] = useState("2025-10-10");
    const [inputEndDate, setInputEndDate] = useState("2025-11-10");

    const handleDateRequestChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setDateType(event.target.value);

        //safety checking for date ranges
        if(event.target.value === "Day range") {
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

        //is the user requesting a specific date range?
        let api_url_query = api_url;
        // console.log(`user is requesting date type: ${selectedDateType}`);
        if(selectedDateType !== "All days"){
            api_url_query += `?date_start=${inputStartDate}`;
            if(selectedDateType === "Day range") {
                api_url_query += `&date_end=${inputEndDate}`;
            }
        }
        // console.log('user is sending GET request to url: ' + api_url_query);

        fetch(api_url_query)
            .then((res) => res.json())
            .then((values) => processRequestJson(values))
            .catch(console.error);
    }

    function processRequestJson(json){

        //construct a subheading showing the date/s for our request
        let newDateHeading = `Catering for: ${json.date_request}`;

        //customise it a bit further
        if(json.date_request === "Single day"){
            newDateHeading += ` ${json.date_start}`;
        } else if(json.date_request === "Day range"){
            newDateHeading += ` ${json.date_start} - ${json.date_end}`;
        }

        //now apply it
        setDateHeading(newDateHeading);

        //loop over all rows in the response json to construct our html table
        const rows = [];
        for(const key in json) {
            //skip fields that start with date because we only want diet prefs in the table
            if(key.substring(0,4) === "date"){
                continue;
            }

            rows.push(
                <tr key={key}>
                    <td><b>{key}</b>: {json[key]}</td>
                </tr>
            );
        }
        setDietTable(<table><tbody>{rows}</tbody></table>);
        setPollButtonText(pollButtonDefaultText);
    }

  return (
    <>
        <h3>Catering requirements for the Hive at Spring Confest 2025</h3>
        <div className="lineItem"><em>
            <label>
                <input
                    type="radio"
                    name="dateRequestInput"
                    value="All days"
                    checked={selectedDateType === "All days"}
                    onChange={handleDateRequestChange}
                />
                All days
            </label>
            <label>
                <input
                    type="radio"
                    name="dateRequestInput"
                    value="Single day"
                    checked={selectedDateType === "Single day"}
                    onChange={handleDateRequestChange}
                />
                Single day
            </label>
            {/*<label>*/}
            {/*    <input*/}
            {/*        type="radio"*/}
            {/*        name="dateRequestInput"*/}
            {/*        value="Day range"*/}
            {/*        checked={selectedDateType === "Day range"}*/}
            {/*        onChange={handleDateRequestChange}*/}
            {/*    />*/}
            {/*    Day range*/}
            {/*</label>*/}
        </em></div>

        <div className="lineItem">

        {/* when the user wants all days */}
        <div className={selectedDateType === "All days" ? "" : "hidden"}><br/></div>

        {/* when the user wants a single day */}
        <div className={selectedDateType === "Single day" ? "" : "hidden"}><input
            type="date"
            name="event"
            min="2025-10-01"
            max="2025-12-01"
            value={inputStartDate}
            onChange={(e) => setInputStartDate(e.target.value)}
        /></div>

        {/* when the user wants a range of days */}
        <div className={selectedDateType === "Day range" ? "" : "hidden"}>Between <input
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
        </div>
        <div className="lineItem"><em>{dateHeading}</em></div>
        <div>{dietTable}</div>
    </>
  )
}

export default App
