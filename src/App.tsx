import { useEffect, useState } from 'react'
import './App.css'

function formatTable(json: []) {
    console.log(json);
    const rows = [];
    const diets = ["will eat anything","vegan","vegetarian"];
    let omni = 0;
    let vegan = 0;
    let vegetarian = 0;
    const other:string[] = [];

    //start at 1 to skip the header row
    for(let i=1; i<json.length; i++){
        if(json[i][6].toLowerCase() === diets[0]){
            omni++;
        } else if(json[i][6].toLowerCase() === diets[1]){
            vegan++;
        } else if(json[i][6].toLowerCase() === diets[2]){
            vegetarian++;
        } else {
            other.push(json[i][6]);
        }
        // for(let j=0; j<json.length; j++) {
        //     rows.push(
        //         <tr key={i}>
        //             <td>{i}</td>
        //         </tr>
        //     );
        // }
    }
    rows.push(
        <tr key={"omni"}>
            <td>Omni: {omni}</td>
        </tr>
    );
    rows.push(
        <tr key={"vegan"}>
            <td>Vegan: {vegan}</td>
        </tr>
    );
    rows.push(
        <tr key={"vegetarian"}>
            <td>Vegetarian: {vegetarian}</td>
        </tr>
    );
    rows.push(
        <tr key={"other"}>
            <td>Other: {other.length}</td>
        </tr>
    );
    for(let i=1; i<other.length; i++){
        rows.push(
            <tr key={i}>
                <td><i>{other[i]}</i></td>
            </tr>);
    }
    return (
        <div><table><tbody>{rows}</tbody></table></div>
    );
}

function App() {

    const backend_port = import.meta.env.VITE_HIVECATER_BACKEND_PORT || 4000;
    const api_url = `http://localhost:${backend_port}/api/sheets`;
    const [data, setData] = useState(<div></div>);


    useEffect(() => {
        fetch(api_url)
            .then((res) => res.json())
            .then((values) => setData(formatTable(values)))
            .catch(console.error);
    }, [api_url]);

  return (
    <>
        <h3>Daily catering requirements for the Hive at Spring Confest 2025</h3>
        <div>{data}</div>
    </>
  )
}

export default App
