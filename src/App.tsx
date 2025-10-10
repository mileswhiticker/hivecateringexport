import { useEffect, useState } from 'react'
import './App.css'

function formatTable(json: []) {
    console.log(json);
    const rows = [];

    for(const key in json) {
        rows.push(
            <tr key={key}>
                <td><b>{key}</b>: {json[key]}</td>
            </tr>
        );
    }
    return (
        <table><tbody>{rows}</tbody></table>
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
        <h3>Total catering requirements for the Hive at Spring Confest 2025</h3>
        <div>{data}</div>
    </>
  )
}

export default App
