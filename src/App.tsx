import { useState } from 'react'
import * as React from "react";
import './App.css'

function App() {

    const backend_port = import.meta.env.VITE_HIVECATER_BACKEND_PORT || 4000;
    const api_url = `http://localhost:${backend_port}/api/sheets`;

    const [dietTable, setDietTable] = useState(<div></div>);
    const [dateHeading, setDateHeading] = useState("Select the desired dates then click the button to continue");
    const [selectedDateRequest, setDateRequest] = useState("All days");

    const [inputStartDate, setInputStartDate] = useState("2025-10-10");
    const [inputEndDate, setInputEndDate] = useState("2025-11-10");

    const handleDateRequestChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setDateRequest(event.target.value);

        //safety checking for date ranges
        if(event.target.value === "Day range") {
            const startDate = new Date(inputStartDate);
            const endDate = new Date(inputEndDate);

            //make sure the end date is always at or after the start date
            if(endDate.getTime() < startDate.getTime()){
                //force the end date to be the same as the start date
                const dateStr = `${startDate.getFullYear()}/${startDate.getMonth()}/${startDate.getDay()}`;
                setInputEndDate(dateStr);
                console.log(`Forcing end date to be: ${dateStr}`);
            }
        }
    };

    const pollingButtonDefault =
        <button onClick={() => pollCateringData()}>
            Generate catering data
        </button>;
    const pollingButtonLoading = <button disabled>Loading, please wait...</button>;
    const [pollingButton, setPollingButton] = useState(pollingButtonDefault);

    function pollCateringData(){
        setPollingButton(pollingButtonLoading);
        setDietTable(<div></div>);
        fetch(api_url)
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
        setPollingButton(pollingButtonDefault);
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
                    checked={selectedDateRequest === "All days"}
                    onChange={handleDateRequestChange}
                />
                All days
            </label>
            <label>
                <input
                    type="radio"
                    name="dateRequestInput"
                    value="Single day"
                    checked={selectedDateRequest === "Single day"}
                    onChange={handleDateRequestChange}
                />
                Single day
            </label>
            <label>
                <input
                    type="radio"
                    name="dateRequestInput"
                    value="Day range"
                    checked={selectedDateRequest === "Day range"}
                    onChange={handleDateRequestChange}
                />
                Day range
            </label>
        </em></div>

        <div className="lineItem">

        {/* when the user wants all days */}
        <div className={selectedDateRequest === "All days" ? "" : "hidden"}><br/></div>

        {/* when the user wants a single day */}
        <div className={selectedDateRequest === "Single day" ? "" : "hidden"}><input
            type="date"
            name="event"
            min="2025-10-01"
            max="2025-12-01"
            value={inputStartDate}
            onChange={(e) => setInputStartDate(e.target.value)}
        /></div>

        {/* when the user wants a range of days */}
        <div className={selectedDateRequest === "Day range" ? "" : "hidden"}>Between <input
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

        <div className="lineItem">{pollingButton}</div>
        <div className="lineItem"><em>{dateHeading}</em></div>
        <div>{dietTable}</div>
    </>
  )
}

export default App
