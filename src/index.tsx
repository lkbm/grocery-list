import { render } from 'preact';
import App from "./App";

// render(<App />, document.getElementById('root'));

const rootElement = document.getElementById('root');
if (rootElement) {
  render(<App />, rootElement);
} else {
  console.error("Root element not found");
}