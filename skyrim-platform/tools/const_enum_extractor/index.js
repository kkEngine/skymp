const fs = require("fs");
const path = require("path");
const ts = require("typescript");

function extractConstEnums(sourceCode) {
    const sourceFile = ts.createSourceFile(
        "temp.ts",
        sourceCode,
        ts.ScriptTarget.ES2015,
        true
    );

    const constEnums = [];

    function visit(node) {
        if (ts.isEnumDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ConstKeyword)) {
            const enumName = node.name.text;
            const values = {};
            let lastValue = -1; // Assume starting value is -1 so the first auto value will be 0 if not specified

            node.members.forEach(member => {
                const key = member.name.getText(sourceFile);
                if (member.initializer) {
                    if (ts.isNumericLiteral(member.initializer)) {
                        lastValue = parseInt(member.initializer.text, 10);
                    } else {
                        // Handle non-numeric initializers differently if necessary
                        lastValue = member.initializer.text; // This simplistic approach assumes all initializers are numeric
                    }
                    values[key] = lastValue;
                } else {
                    // If no initializer is present, increment the last value
                    values[key] = ++lastValue;
                }
            });

            constEnums.push({ name: enumName, values });
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    return constEnums;
}

const skyrimPlatformTsPath = "../../../skyrim-platform/src/platform_se/codegen/convert-files/skyrimPlatform.ts";
const constEnumApiCppPath = "../../../skyrim-platform/src/platform_se/skyrim_platform/ConstEnumApi.cpp";

const tsCode = fs.readFileSync(skyrimPlatformTsPath, "utf8");

const generatedBy = path.relative("../../..", __dirname).replaceAll("\\", "/");
const comment = `// This file is generated by ${generatedBy}\n\n`;

const prefix = "#include \"ConstEnumApi.h\"\n\nvoid ConstEnumApi::Register(JsValue& exports,\n                            std::shared_ptr<JsEngine> jsEngine)\n{\n";

const stringifyValue = (value) => {
    if (typeof value === "number" && value >= 2147483648) {
        // hack to overcome int limitations
        return `jsEngine->RunScript("${value}", "_.js")`;
    }
    return JSON.stringify(value);
};

const body = extractConstEnums(tsCode).map(({ name, values }) => {
    const enumObject = `  auto ${name} = JsValue::Object();\n`;

    const setProperty = Object.entries(values).map(([key, value]) => {
        return `  ${name}.SetProperty(${stringifyValue(value)}, "${key}");\n`;
    }).join("");

    const setPropertyString = Object.entries(values).map(([key, value]) => {
        return `  ${name}.SetProperty("${key}", ${stringifyValue(value)});\n`;
    }).join("");

    const exportsString = `  exports.SetProperty("${name}", ${name});\n`;

    return enumObject + setProperty + setPropertyString + exportsString;
}).join("\n");

const suffix = "}\n";

const result = comment + prefix + body + suffix;

fs.writeFileSync(constEnumApiCppPath, result, "utf8");
