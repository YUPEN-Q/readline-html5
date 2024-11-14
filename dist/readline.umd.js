(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.readline = {}));
})(this, (function (exports) { 'use strict';

    /**
     * Readline from a stream.
     *
     * It accepts {Response|ReadableStream|Blob|File} as input.
     *
     * This function reads lines from top to bottom.
     *
     * Example:
     *
     * ``` javascript
     * async test() {
     *     const blob = new Blob(["abc\ndfg"])
     *     console.log("readline_from_stream...")
     *     const irs_fs = await readline_from_stream(blob);
     *     for (let { done, value } = await irs_fs.next(); !done; { done, value } = await irs_fs.next()) {
     *         const [bytesRead, size, line_no, line] = value;
     *         console.log("line:", bytesRead, size, line_no, JSON.stringify(line));
     *     }
     * }
     * test();
     * ```
     *
     * Reference:
     *  + [JavaScript Generator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Generator)
     *  + [Web API - File API](https://developer.mozilla.org/en-US/docs/Web/API/File_API)
     *  + [Web API - File Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob)
     *  + [Web API - ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)
     *  + [Web API - Response](https://developer.mozilla.org/en-US/docs/Web/API/Response)
     *
     * @param {Response|ReadableStream|Blob|File} input
     * @param {string} encoding of textdecoder, https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/encoding
     * @param {Function} check_aborted - callback to check if the operating is aborted
     * @returns {AsyncGenerator}
     */
    async function* readline_from_stream(input, encoding = "utf-8", check_aborted = () => false) {
        // init the text decoder
        //
        const [stream, size, from] = await (async (input) => {
            if (input instanceof Response) {      // fetch    > ReadableStream
                return [input.body, parseInt(input.headers.get("content-length")), "response"]
            } else if (input instanceof ReadableStream) {
                return [input, length, "stream"]
            } else if (input instanceof Blob) {   // file/blob  > ReadableStream >
                return [await input.stream(), input.size, "blob"]
            } else {
                throw new Error("unsupport type of input. [" + typeof (input) + "]")
            }
        })(input);
        // console.log("stream...", stream.cancel, stream.close)
        const internal_check_aborted = async () => {
            const aborted = check_aborted();
            // if (line_no >= max_line) controller.abort()
            if (aborted === true) {
                try {
                    await reader.cancel();
                } catch (e) {
                    console.error("cancel read failed...", e);
                }
                return true
            }
            return false
        };
        // ################
        const decoder = new TextDecoder(encoding);
        // Step 1: obtain a reader from stream
        const /*ReadableStreamDefaultReader*/ reader = await stream.getReader();
        // Step 2: read the data
        let bytesRead = 0; // read that many bytes at the moment
        let accumulated_spare_chunks = undefined;
        let line_no = 0;
        while (true) {   // infinite loop while the data is reading
            if (await internal_check_aborted()) return
            // done is true for the last chunk, and value is Uint8Array of the chunk bytes
            let { done, value } = await reader.read();
            if (done) break;
            // Step 3: find the "\n", and popup the line
            let last_ln_pos = 0;
            while (true) {
                if (await internal_check_aborted()) return
                // ###
                let pos = value.indexOf(10, last_ln_pos);   // char(10) = "\n"
                if (pos === -1) {
                    // if did not find the "\n", accumulative the spare chunks
                    let spare_chunks = value.slice(last_ln_pos);
                    let _accumulated_spare_chunks = accumulated_spare_chunks === undefined ? new Uint8Array() : accumulated_spare_chunks;
                    accumulated_spare_chunks = new Uint8Array(_accumulated_spare_chunks.length + spare_chunks.length);
                    accumulated_spare_chunks.set(_accumulated_spare_chunks, 0);
                    accumulated_spare_chunks.set(spare_chunks, _accumulated_spare_chunks.length);
                    break;
                }
                let line_chunks = value.slice(last_ln_pos, pos + 1);
                if (accumulated_spare_chunks !== undefined) {
                    let concated_chunks = new Uint8Array(accumulated_spare_chunks.length + line_chunks.length);
                    concated_chunks.set(accumulated_spare_chunks, 0);
                    concated_chunks.set(line_chunks, accumulated_spare_chunks.length);
                    line_chunks = concated_chunks;
                    // reset accumulated_spare_chunks
                    accumulated_spare_chunks = undefined;
                }
                // ###
                bytesRead += line_chunks.length;
                // ### trim "\r?\n" at the end of line
                if (line_chunks.at(-1) === 10) {       // char(10) = "\n"
                    line_chunks = line_chunks.slice(0, -1);
                    if (line_chunks.at(-1) === 13) {   // char(13) = "\r"
                        line_chunks = line_chunks.slice(0, -1);
                    }
                }
                let line = decoder.decode(line_chunks);
                line_no++;
                yield [bytesRead, size, line_no, line, from];
                //
                last_ln_pos = pos + 1;
            }
        }
        // Step 4: popup the lastline if it is not end without "\n"
        if (accumulated_spare_chunks !== undefined) {
            if (await internal_check_aborted()) return
            // ####
            let line_chunks = accumulated_spare_chunks;
            // ####
            bytesRead += line_chunks.length;
            // #### trim "\r?\n" at the end of line
            if (line_chunks.at(-1) === 10) {
                line_chunks = line_chunks.slice(0, -1);
                if (line_chunks.at(-1) === 13) {
                    line_chunks = line_chunks.slice(0, -1);
                }
            }
            let line = decoder.decode(line_chunks);
            line_no++;
            yield [bytesRead, size, line_no, line, from];
        }
    }

    const SLICE_BLOB_CHUNK_SIZE = 1024 * 64;

    /**
     * Readline(top -> bottom) from a Blob or File.
     *
     * @param {Blob|File} input
     * @param {string} encoding of textdecoder, https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/encoding
     * @param {Function} check_aborted - callback to check if the operating is aborted
     * @returns {AsyncGenerator}
     */
    async function* readline_from_blob_forwards(input, encoding = "utf-8", check_aborted = () => false) {
        const CHUNK_SIZE = SLICE_BLOB_CHUNK_SIZE;
        // Get size of the file.
        const size = input.size;
        // ######## slicing blob/file to small chunks
        const chunks = [];
        let cur = 0;
        while (cur < size) {
            const blob = input.slice(cur, cur + CHUNK_SIZE);
            chunks.push(blob);
            cur = cur + blob.size;
        }
        // console.log("chunks.size...", chunks.length)
        // ###
        let bytesRead = 0;     // read that many bytes at the moment
        let accumulated_spare_chunks = undefined;
        // infinite loop while the data is reading
        let line_no = 0;
        // ###
        const decoder = new TextDecoder(encoding);
        // ### read from top to bottom
        while (chunks.length !== 0) {
            if (await check_aborted()) return
            const blob = chunks.shift();
            const value = new Uint8Array(await blob.arrayBuffer());
            // console.log("value...", "[" + value.join(",") + "]", "[" + accumulated_spare_chunks.join(",") + "]")
            // console.log("xxx", done, value.length);
            // Step 3: find the "\n", and popup the line
            let last_ln_pos = 0;
            while (true) {
                if (await check_aborted()) return
                // ###
                let pos = value.indexOf(10, last_ln_pos);   // char(10) = "\n"
                if (pos === -1) {
                    // if did not find the "\n", accumulative the spare chunks
                    let spare_chunks = value.slice(last_ln_pos);
                    let _accumulated_spare_chunks = accumulated_spare_chunks === undefined ? new Uint8Array() : accumulated_spare_chunks;
                    accumulated_spare_chunks = new Uint8Array(_accumulated_spare_chunks.length + spare_chunks.length);
                    accumulated_spare_chunks.set(_accumulated_spare_chunks, 0);
                    accumulated_spare_chunks.set(spare_chunks, _accumulated_spare_chunks.length);
                    break;
                }
                let line_chunks = value.slice(last_ln_pos, pos + 1);
                if (accumulated_spare_chunks !== undefined) {
                    let concated_chunks = new Uint8Array(accumulated_spare_chunks.length + line_chunks.length);
                    concated_chunks.set(accumulated_spare_chunks, 0);
                    concated_chunks.set(line_chunks, accumulated_spare_chunks.length);
                    line_chunks = concated_chunks;
                    // reset accumulated_spare_chunks
                    accumulated_spare_chunks = undefined;
                }
                // ####
                bytesRead += line_chunks.length;
                // #### trim "\r?\n" at the end of line
                if (line_chunks.at(-1) === 10) {
                    line_chunks = line_chunks.slice(0, -1);
                    if (line_chunks.at(-1) === 13) {
                        line_chunks = line_chunks.slice(0, -1);
                    }
                }
                let line = decoder.decode(line_chunks);
                line_no++;
                yield [bytesRead, size, line_no, line];
                //
                last_ln_pos = pos + 1;
            }
        }
        // Step 3: popup the lastline if it is not end without "\n"
        if (accumulated_spare_chunks !== undefined) {
            if (await check_aborted()) return
            // ####
            let line_chunks = accumulated_spare_chunks;
            // ####
            bytesRead += line_chunks.length;
            // #### trim "\r?\n" at the end of line
            if (line_chunks.at(-1) === 10) {
                line_chunks = line_chunks.slice(0, -1);
                if (line_chunks.at(-1) === 13) {
                    line_chunks = line_chunks.slice(0, -1);
                }
            }
            let line = decoder.decode(line_chunks);
            line_no++;
            yield [bytesRead, size, line_no, line];
        }
    }

    /**
     * Readline(bottom -> top) from a Blob or File.
     *
     * @param {Blob|File} input
     * @param {string} encoding of textdecoder, https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/encoding
     * @param {Function} check_aborted - callback to check if the operating is aborted
     * @returns {AsyncGenerator}
     */
    async function* readline_from_blob_backwards(input, encoding = "utf-8", check_aborted = () => false) {
        const CHUNK_SIZE = SLICE_BLOB_CHUNK_SIZE;
        // Get size of the file.
        const size = input.size;
        // ######## slicing blob/file to small chunks
        const chunks = [];
        let cur = 0;
        while (cur < size) {
            const blob = input.slice(cur, cur + CHUNK_SIZE);
            chunks.push(blob);
            cur = cur + blob.size;
        }
        // console.log("chunks.size...", chunks.length)
        // ###
        let bytesRead = 0;         // read that many bytes at the moment
        let accumulated_spare_chunks = undefined;
        // infinite loop while the data is reading
        let line_no = 0;
        // ###
        const decoder = new TextDecoder(encoding);

        // ### read from bottom to top
        while (chunks.length !== 0) {
            if (await check_aborted()) return
            const blob = chunks.pop();
            const value = new Uint8Array(await blob.arrayBuffer());
            // console.log("value...", "[" + value.join(",") + "]", "[" + accumulated_spare_chunks.join(",") + "]")
            // ##############
            let last_ln_pos = -1;
            while (true) {
                if (await check_aborted()) return
                //
                let pos = value.lastIndexOf(10, last_ln_pos);   // char(10) = "\n"
                // console.log("lastIndexOf...", value.length, pos, last_ln_pos)
                if (pos === -1) {
                    // if did not find the "\n", accumulative the spare chunks
                    let spare_chunks = value.slice(0, value.length + last_ln_pos + 2);
                    let _accumulated_spare_chunks = accumulated_spare_chunks === undefined ? new Uint8Array() : accumulated_spare_chunks;
                    accumulated_spare_chunks = new Uint8Array(_accumulated_spare_chunks.length + spare_chunks.length);
                    accumulated_spare_chunks.set(spare_chunks, 0);
                    accumulated_spare_chunks.set(_accumulated_spare_chunks, spare_chunks.length);
                    break;
                }
                // #############
                let line_chunks = value.slice(pos + 1, value.length + last_ln_pos + 2);
                // console.log("line_chunks.111..", "[" + line_chunks.join(",") + "]")
                if (accumulated_spare_chunks !== undefined) {
                    let concated_chunks = new Uint8Array(accumulated_spare_chunks.length + line_chunks.length);
                    concated_chunks.set(line_chunks, 0);
                    concated_chunks.set(accumulated_spare_chunks, line_chunks.length);
                    line_chunks = concated_chunks;
                    // reset accumulated_spare_chunks
                    accumulated_spare_chunks = undefined;
                }
                // console.log("line_chunks.222..", "[" + line_chunks.join(",") + "]")
                // ####
                bytesRead += line_chunks.length;
                // #### trim "\r?\n" at the end of line
                if (line_chunks.at(-1) === 10) {
                    line_chunks = line_chunks.slice(0, -1);
                    if (line_chunks.at(-1) === 13) {
                        line_chunks = line_chunks.slice(0, -1);
                    }
                }
                let line = decoder.decode(line_chunks);
                line_no--;
                yield [bytesRead, size, line_no, line];
                // ####
                last_ln_pos = pos - value.length - 1;
                // if (line_no < -5) break
            }
        }
        // Step 3: popup the lastline if it is not end without "\n"
        if (accumulated_spare_chunks !== undefined) {
            if (await check_aborted()) return
            //
            let line_chunks = accumulated_spare_chunks;
            // ####
            bytesRead += line_chunks.length;
            // #### trim "\r?\n" at the end of line
            if (line_chunks.at(-1) === 10) {
                line_chunks = line_chunks.slice(0, -1);
                if (line_chunks.at(-1) === 13) {
                    line_chunks = line_chunks.slice(0, -1);
                }
            }
            let line = decoder.decode(line_chunks);
            line_no--;
            yield [bytesRead, size, line_no, line];
        }
    }

    // #############################
    // async function readline_test1() {
    //     const content = "1abc\n2def\n3hij\n"
    //     // console.log(content)
    //     const blob = new Blob([content])
    //     console.log(blob.size)
    //     console.log("readline_backwards...")
    //     const irs_bw = await readline_from_blob_backwards(blob);
    //     console.log(irs_bw)
    //     for (let { done, value } = await irs_bw.next(); !done; { done, value } = await irs_bw.next()) {
    //         const [bytesRead, size, line_no, line] = value;
    //         console.log("line:", bytesRead, size, line_no, JSON.stringify(line));
    //     }
    //     console.log("readline_forwards...")
    //     const irs_fw = await readline_from_blob_forwards(blob);
    //     for (let { done, value } = await irs_fw.next(); !done; { done, value } = await irs_fw.next()) {
    //         const [bytesRead, size, line_no, line] = value;
    //         console.log("line:", bytesRead, size, line_no, JSON.stringify(line));
    //     }
    //     console.log("readline_from_stream...")
    //     const irs_fs = await readline_from_stream(blob);
    //     for (let { done, value } = await irs_fs.next(); !done; { done, value } = await irs_fs.next()) {
    //         const [bytesRead, size, line_no, line] = value;
    //         console.log("line:", bytesRead, size, line_no, JSON.stringify(line));
    //     }
    // }
    // readline_test1()
    // #############################

    /**
     *
     * Example:
     * ```
     * async function on_fileload(file, progress) {
     *     let [controller, irs] = await readline(file);
     *     for (let {done, value} = await irs.next();!done;{done, value} = await irs.next()) {
     *         let [bytesRead, size, line_no, line] = value;
     *         // console.log("online", ii++, value);
     *         progress(value);
     *     }
     *     progress(); // pass undefined to notify done.
     *
     *     // let [controller, irs] = await readline(file);
     *     // let nval = await irs.next();
     *     // while (!nval.done) {
     *     //     let [bytesRead, size, line_no, line] = nval.value;
     *     //     if (bytesRead >= prog_queue[0]) {
     *     //         console.log(line_no, (bytesRead / size * 100).toFixed(2), " > " +  JSON.stringify(line));
     *     //         prog_queue.shift();
     *     //     }
     *     //     //
     *     //     nval = await irs.next();
     *     // }
     * }
     *
     * async function abort_read(fh) {
     *     const file = await fh.getFile()
     *     const [controller, irs] = await readline(file);
     *     for (let { done, value } = await irs.next(); !done; { done, value } = await irs.next()) {
     *         const [bytesRead, size, line_no, line] = value;
     *         console.log("line:", line_no, line);
     *         if (line_no >= 8) {
     *             controller.abort()
     *         }
     *         // progress(value);
     *     }
     *     console.log(fh, file);
     * }
     *
     * // file object is able to re-open,
     * async function read(file) {
     *     const [controller, irs] = await readline(file);
     *     for (let { done, value } = await irs.next(); !done; { done, value } = await irs.next()) {
     *         const [bytesRead, size, line_no, line] = value;
     *         console.log("line:", line_no, line);
     *     }
     * }
     * const file = await fh.getFile()
     * await read(file);
     * await read(file);
     * // but response will "Failed to execute 'getReader' on 'ReadableStream': ReadableStreamDefaultReader constructor can only accept readable streams that are not yet locked to a reader"
     * async function abort_fetch(res) {
     *     const [controller, irs] = await readline(res);
     *     for (let { done, value } = await irs.next(); !done; { done, value } = await irs.next()) {
     *         const [bytesRead, size, line_no, line] = value;
     *         console.log("line:", line_no, line);
     *         if (line_no >= 3) {
     *             controller.abort()
     *         }
     *     }
     * }
     * const res = await fetch("./")
     * await abort_fetch(res)
     * await abort_fetch(res)
     *
     * //
     * async function abort_fetch(url) {
     *     const res = await fetch(url)
     *     const [controller, irs] = await readline(res);
     *     for (let { done, value } = await irs.next(); !done; { done, value } = await irs.next()) {
     *         const [bytesRead, size, line_no, line] = value;
     *         console.log("line:", line_no, line);
     *         if (line_no >= 3) {
     *             controller.abort()
     *         }
     *     }
     * }
     * await abort_fetch("./")
     *
     * ################################################################################
     * #
     * function ollama_fetch_es(url, payload) {
     *     const controller = new AbortController();
     *     // @@@@@
     *     async function* _read(input) {
     *         for (let { done, value } = await input.next(); !done; { done, value } = await input.next()) {
     *             const [, , nr, line] = value;
     *             const data = JSON.parse(line);
     *             yield { nr, data }
     *             if (data.done) controller.abort()
     *         }
     *     }
     *     // @@@@@
     *     return [
     *         controller, fetch(url, {
     *             method: 'post',
     *             headers: {
     *                 'Content-Type': 'application/json'
     *             },
     *             body: JSON.stringify(payload)
     *         }).then((res) => readline(res, "utf-8", controller))
     *             .then(([, irs]) => _read(irs))
     *     ]
     * }
     * const [ctl, fp] = ollama_fetch_es("http://localhost:11434/api/generate", payload);
     * (async () => {
     *     const irs = await fp;
     *     for (let { done, value } = await irs.next(); !done; { done, value } = await irs.next()) {
     *         const { nr, data } = value
     *         console.log("..." + new Date(), nr, data);
     *     }
     * })();
     * ################################################################################
     *
     * ```
     *
     * @param {Response|ReadableStream|Blob|File} input
     * @param {string} encoding of textdecoder, https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/encoding
     * @returns {Array[AbortController, AsyncGenerator]}
     */
    async function readline(input, encoding = "utf-8", controller = undefined) {
        controller = controller instanceof AbortController ? controller : new AbortController();
        return [controller, await readline_from_stream(input, encoding, () => controller.signal.aborted)]
    }

    /**
     *
     *
     * @param {Blob|File} input
     * @param {string} encoding of textdecoder, https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/encoding
     * @returns {Array[AbortController, AsyncGenerator]}
     */
    async function readline_forwards(input, encoding = "utf-8", controller = undefined) {
        controller = controller instanceof AbortController ? controller : new AbortController();
        return [controller, await readline_from_blob_forwards(input, encoding, () => controller.signal.aborted)]
    }

    /**
     *
     *
     * @param {Blob|File} input
     * @param {string} encoding of textdecoder, https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/encoding
     * @returns {Array[AbortController, AsyncGenerator]}
     */
    async function readline_backwards(input, encoding = "utf-8", controller = undefined) {
        controller = controller instanceof AbortController ? controller : new AbortController();
        return [controller, await readline_from_blob_backwards(input, encoding, () => controller.signal.aborted)]
    }


    /**
     *
     *
     *
     * ``` javascript
     * async function around_read(fh) {
     *     const file = await fh.getFile()
     *     const [controller, lines_around, irs] = await internal_readline_around(readline, file, 3)
     *     // console.log("...", lines_around, irs)
     *     // #####
     *     for (let { done, value } = await irs.next(); !done; { done, value } = await irs.next()) {
     *         const [bytesRead, size, line_no, line] = value;
     *         // if (line_no >= 3) controller.abort()
     *         const la = lines_around(-1, 1);
     *         console.log("line:", line_no + ":" + line, "lines_around:", la.map((itm) => itm[2] + ":" + itm[3]));
     *     }
     * }
     * await around_read(fh);
     * ```
     */
    async function internal_readline_around(impl, input, MAX_AROUND_SIZE = 30, encoding = "utf-8") {
        MAX_AROUND_SIZE = Math.max((typeof (MAX_AROUND_SIZE) !== "number" ? 10 : MAX_AROUND_SIZE), 10);
        const BUFFER = []; //
        let buffer_idx = 0;
        /**
         *
         * lines_around(-1, -1) = [previous_line]
         * lines_around(-1, 0) = [previous_line, current_line]
         * lines_around(-1, 1) = [previous_line, current_line, next_line]
         * lines_around(0, 1) = [current_line, next_line]
         * lines_around(1, 1) = [next_line]
         * lines_around() = [...all_bufferred_lines]
         * lines_around(0) = [current_line ,..., last_line]
         * lines_around(1) = [next_line ,..., last_line]
         * lines_around(-1) = [previous_line ,..., last_line]
         */
        const lines_around = (before = Number.NEGATIVE_INFINITY, after = Number.POSITIVE_INFINITY) => {
            if (after < before) {
                throw new Error("Invalid Range Of lines_around. " + JSON.stringify([before, after]))
            }
            const start_idx = Math.max(buffer_idx + before, 0);
            const end_idx = Math.min(buffer_idx + after + 1, BUFFER.length);
            // console.log("lines_around...", buffer_idx, start_idx, end_idx)
            return BUFFER.slice(start_idx, end_idx); // , BUFFER.map((itm) => itm[2] + ":" + itm[3])
        };
        // #########

        async function* _read(reader, signal) {
            // #########
            // Fill last half of the buffer from the file
            for (; BUFFER.length !== MAX_AROUND_SIZE + 1;) {
                const { done, value } = await reader.next();
                if (done) break;
                BUFFER.push(value);
            }
            // ##########
            while (buffer_idx < BUFFER.length) {
                const cur_line_item = BUFFER[buffer_idx];
                // const cur_line_item = BUFFER.shift();
                // ################
                if (signal.aborted === true) return
                // console.log(cur_line_item[2] + ":" + cur_line_item[3], BUFFER.map((itm) => itm[2] + ":" + itm[3]))
                yield cur_line_item;
                // push next line to buffer.
                const { done: next_done, value: next_value } = await reader.next();
                if (!next_done) {
                    BUFFER.push(next_value);
                }
                // ###############
                if (buffer_idx < MAX_AROUND_SIZE) {
                    buffer_idx++;
                } else {
                    BUFFER.shift();
                }
            }
        }
        //
        const [controller, irs] = await impl(input, encoding);
        return [controller, lines_around, await _read(irs, controller.signal)]
    }

    const readline_around = internal_readline_around.bind(null, readline);
    const readline_around_forwards = internal_readline_around.bind(null, readline_forwards);
    const readline_around_backwards = internal_readline_around.bind(null, readline_backwards);


    // #############################
    // async function readline_around_test() {
    //     const content = "1abc\n2def\n3hij\n4klm"
    //     // console.log(content)
    //     const blob = new Blob([content])
    //     console.log(blob.size)
    //     console.log("readline_around_backwards...")
    //     const [controller_bw, lines_around_bw, irs_bw] = await readline_around_backwards(blob);
    //     // console.log(irs_bw)
    //     for (let { done, value } = await irs_bw.next(); !done; { done, value } = await irs_bw.next()) {
    //         const [bytesRead, size, line_no, line] = value;
    //         // if (line_no <= -3) controller_bw.abort()
    //         const la = lines_around_bw(-1, 1);
    //         console.log("line:",
    //             line_no + ":" + JSON.stringify(line),
    //             "lines_around_bw:", la.map((itm) => itm[2] + ":" + JSON.stringify(itm[3])).join(",")
    //         );
    //     }
    //     //
    //     console.log("readline_around_forwards...")
    //     const [controller_fw, lines_around_fw, irs_fw] = await readline_around_forwards(blob);
    //     // console.log(irs_bw)
    //     for (let { done, value } = await irs_fw.next(); !done; { done, value } = await irs_fw.next()) {
    //         const [bytesRead, size, line_no, line] = value;
    //         // if (line_no <= -3) controller_fw.abort()
    //         const la = lines_around_fw(-1, 1);
    //         console.log("line:",
    //             line_no + ":" + JSON.stringify(line),
    //             "lines_around_fw:", la.map((itm) => itm[2] + ":" + JSON.stringify(itm[3])).join(",")
    //         );
    //     }

    // }
    // readline_around_test()
    // #############################

    exports.readline = readline;
    exports.readline_around = readline_around;
    exports.readline_around_backwards = readline_around_backwards;
    exports.readline_around_forwards = readline_around_forwards;
    exports.readline_backwards = readline_backwards;
    exports.readline_forwards = readline_forwards;

}));
