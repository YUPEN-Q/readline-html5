## Overview

  `readline` is a lightweight JavaScript library designed to streamline the process of reading large text data, such as logs or data files, in a line-by-line manner directly within a web browser. Leveraging the HTML5 APIs, it can handle various input types commonly used in web applications, including Response (for data fetched from the network), ReadableStream (for custom streams), Blob, and File objects.

  One of the primary advantages of readline is its flexibility and efficiency in dealing with large data. Instead of loading entire files or streams into memory—which can be resource-intensive—this library enables developers to process data incrementally, line by line. This approach not only conserves memory but also enhances responsiveness, as it avoids blocking the main JavaScript thread, making it ideal for applications that require real-time data processing, such as log viewers, data parsers, or applications analyzing live streams.

  Additionally, readline includes unique functionality for Blob and File inputs, allowing for both forward and backward line reading. This feature is particularly useful for applications where reverse-log reading or end-to-beginning data analysis is required.

## Key Features

  * Supported Input Types: Outline the compatible data sources:
    - Response: Fetch API responses.
    - ReadableStream: Supports any stream object implementing the ReadableStream API.
    - Blob/File: Local files or blobs with the added capability of backward reading.
  * Controlling Line Reading with AbortController, this allows you to stop reading lines at any point. which is especially useful for handling large files or streams where you may not need to process the entire content.

## Example Use Cases

  • Use Case 1: Reading response of Ollama response which it is using jsonl
  • Use Case 2: Incrementally processing large CSV files for data analysis.

## Getting Started

### Installation

The readline library is easy to integrate, whether you’re working in a Node-based frontend project or directly in the browser. Below are several options to get started:

  1. In a Node-based Frontend Project

    Install via npm to use readline in projects set up with a bundler or package manager (e.g., Webpack, Vite):

    ``` shell
    $ npm install @yupen-q/readline
    ```

    Once installed, import it in your code:

    ``` javascript
    import { readline } from "@yupen-q/readline";
    ```

  2. Using [JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) in the Browser

    Import directly from a CDN:

    ``` javascript
    import { readline } from "https://cdn.todo.com/@yupen-q/readline/main.es.js"
    ```

    or

    To map readline in an [importmap](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap) for ease of use across modules:

    ``` html
    <script type="importmap">
      {
        "imports": {
          "@yupen-q/readline": "https://cdn.todo.com/readline.es.js"
        }
      }
    </script>
    <script>
    import { readline } from "@yupen-q/readline"
    </script>
    ```

  3. Including as a Global Script

    For projects that prefer a global variable accessible across scripts without import statements, add the library as a traditional script tag. This method makes `@yupen-q/readline` available globally on the window object:

    ``` html
    <script src="https://cdn.todo.com/@yupen-q/readline/main.umd.js"></script>
    <script>
      window.readline_html5
    </script>
    ```

### Basic Usage

    ``` JavaScript
    import { readline } from "@yupen-q/readline"
    async function read() {
      let [controller, irs] = await readline(file);
      for (let {done, value} = await irs.next();!done;{done, value} = await irs.next()) {
        let [bytesRead, size, line_no, line] = value;
        console.log("online", ii++, value);
      }
    }
    ```

### Advanced Usage

  * readline backward
  * line_around function
  * Streamable Reading with Abort Control
  * ...TODO...

## API Details

  TODO: List the main methods and properties, with a brief description of each.


