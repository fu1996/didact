import React from "react";
import ReactDOM from "react-dom";

const App = () => {
  console.log("Hello", <h1 title="foo">Hello</h1>);
  return <h1 title="foo">Hello</h1>;
};

ReactDOM.render(<App />, document.getElementById("root"));
