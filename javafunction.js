var fs = require("fs");
var osType = require("os").type();
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var iconv = require('iconv-lite');

module.exports = function (RED) {
    "use strict";
    function JavaFunctionNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;
        this.name = n.name;
        this.func = n.func;
        var id = n.id.replace(/[^a-zA-Z0-9]/g, "");
		this.jars = n.jars;
		this.imports = n.imports;
		this.import = '';
		for (let statement of this.imports) {
			this.import += statement;
		}
        var javaCode = 'import java.awt.*;' +
                       'import java.awt.datatransfer.*;' +
                       'import java.awt.event.*;' +
                       'import java.awt.image.*;' +
                       'import java.io.*;' +
                       'import java.math.*;' +
                       'import java.net.*;' +
                       'import java.nio.*;' +
                       'import java.text.*;' +
                       'import java.util.*;' +
                       'import javax.imageio.*;' +
                       'import javax.print.*;' +
                       'import javax.sound.midi.*;' +
                       'import javax.swing.*;' +
                       'import javax.tools.*;' +
                       'import javax.xml.*;' +
                       'import com.google.gson.*;' +
                       'import com.google.gson.stream.*;' +
					   this.import +
                       '' +
                       'public class JavaFunction' + id + ' {' +
                       '    public static JsonObject main(JsonObject msg) throws Exception {' +
                       this.func +
                       '    }' +
                       '    public static void main(String[] args) throws Exception {' +
                       '        while (true) {' +
                       '            try {' +
                       '                Scanner sc = new Scanner(System.in);' +
                       '                String line = sc.nextLine();' +
                       '                JsonObject jo = new Gson().fromJson(line, JsonObject.class);' +
                       '                System.out.print(main(jo));' +
                       '            } catch (Exception e) {' +
                       '                System.err.print(e);' +
                       '            }' +
                       '        }' +
                       '    }' +
                       '}';
        this.topic = n.topic;
        this.activeProcesses = {};

        node.status({fill: "green", shape: "dot", text: "compiling..."});
        fs.writeFileSync("JavaFunction" + id + ".java", javaCode);
        var directorySeparator = osType === "Windows_NT" ? "\\" : "/";
        var classSeparator = osType === "Windows_NT" ? ";" : ":";
        var encoding = osType === "Windows_NT" ? "Shift_JIS" : "UTF-8";
        var child;
		var externalJar = '';
		for (let j of this.jars) {
			externalJar += (j + classSeparator);
		}
        exec("javac -cp " + __dirname + directorySeparator + "gson-2.8.5.jar" + classSeparator + externalJar + ". JavaFunction" + id + ".java",
             { encoding: "binary" },
             function (error, stdout, stderr) {
                if (stderr) {
                    stderr = iconv.decode(stderr, encoding);
                    node.error("error: " + stderr);
                    node.status({fill: "red", shape: "ring", text: "compile failed"});
                } else {
                    console.log("success: compiled");
                    node.status({fill: "green", shape: "dot", text: "compiled"});
                    var options = ["-cp", __dirname + directorySeparator + "gson-2.8.5.jar" + classSeparator + externalJar + classSeparator + ".", "JavaFunction" + id];
                    if (osType === "Darwin") {
                        options.unshift("-Dapple.awt.UIElement=true");
                    }
                    child = spawn("java", options, {encoding: "binary"});
                    child.stdout.on('data', function (data) {
                        try {
                            data = iconv.decode(data, encoding);
                            var msg = JSON.parse(data);
                            node.send(msg);
                            node.status({});
                        } catch (error) {
                            node.error("error: " + error);
                            node.status({fill: "red", shape: "ring", text: "error"});
                        }
                    });
                    child.stderr.on('data', function (data) {
                        data = iconv.decode(data, encoding);
                        node.error("error: " + data);
                        node.status({fill: "red", shape: "ring", text: "error"});
                    });
                    child.on('close', function (code, signal) {
                        console.log("close: " + code + ", " + signal);
                    });
                    child.on('error', function (code) {
                        node.error("error: " + code);
                        node.status({fill: "red", shape: "ring", text: "error"});
                    });
                    node.activeProcesses[child.pid] = child;
                }
            }
		);
        this.on("input", function (msg) {
            try {
                node.status({fill: "green", shape: "dot", text: "executing..."});
                child.stdin.write(JSON.stringify(msg) + "\n");
            } catch (error) {
                node.error("error: " + error);
                node.status({fill: "red", shape: "ring", text: "error"});
            }
        });
        this.on("close", function () {
            for (var pid in node.activeProcesses) {
                if (node.activeProcesses.hasOwnProperty(pid)) {
                    if (node.activeProcesses[pid].tout) { clearTimeout(node.activeProcesses[pid].tout); }
                    var process = node.activeProcesses[pid];
                    node.activeProcesses[pid] = null;
                    process.kill();
                }
            }
            node.activeProcesses = {};
            try {
                fs.unlinkSync("JavaFunction" + id + ".java");
                fs.unlinkSync("JavaFunction" + id + ".class");
            } catch (e) {}
            node.status({});
        });
    }
    RED.nodes.registerType("javafunction", JavaFunctionNode);
    RED.library.register("functions");
};
