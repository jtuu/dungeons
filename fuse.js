const path = require("path");
const fs = require("fs");
const { FuseBox } = require("fuse-box");
const { watch, task } = require("fuse-box/sparky");

const inputDir = "src";
const outputDir = "dist";
const mainFiles = ["tetris_dungeon.ts"];
const outputTemplate = fs.readFileSync(`${inputDir}/template.html`, "utf8");

const fuse = FuseBox.init({
    homeDir: inputDir,
    output: `${outputDir}/$name.js`,
    plugins: []
});

function makeWithTemplate(template, arg) {
    return template.replace(/\$output/, arg);
}

task("default", async () => {
    let listingMarkup = "<ul>";

    mainFiles.forEach(fileName => {
        const {name: baseName} = path.parse(fileName);

        listingMarkup += `<li><a href="${baseName}.html">${baseName}</a></li>`;

        fuse.bundle(baseName)
            .instructions(`>${fileName}`)
            .watch();

        watch(`${outputDir}/*.js`)
            .file("*", file => {
                fs.writeFile(`${outputDir}/${baseName}.html`, makeWithTemplate(outputTemplate, `<script src="${file.name}"></script>`), err => {
                    if (err) {
                        console.error(err);
                    }
                });
            }).exec();
    });

    listingMarkup += "</ul>";

    fs.writeFile(`${outputDir}/index.html`, makeWithTemplate(outputTemplate, listingMarkup), err => {
        if (err) {
            console.error(err);
        }
    })

    fuse.run();
});
