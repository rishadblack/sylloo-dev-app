// commands/download.js
import "dotenv/config";
import { Command } from "commander";
import {
  postModuleApp,
  updateProject,
  getAllFiles,
  postModuleAppDownload,
  handleErrorMessage,
} from "../app/utils.js";
import inquirer from "inquirer";
import { writeFile, mkdir } from "fs/promises";
import { join, basename, dirname } from "path";

const passCommand = new Command("command")
  .argument("[project]", "Project name to sync")
  .argument("[module]", "Module name to sync with project")
  .argument("<commandName...>", "Command name to pass")
  .description("Pass command to server")
  .action(async (project, module, commandName) => {
    // Check if project or module are not provided
    if (!project || !module) {
      // Prompt for missing arguments
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "project",
          message: "Enter the project name:",
          when: () => !project, // Prompt if project is not provided
        },
        {
          type: "input",
          name: "module",
          message: "Enter the module name:",
          when: () => !module, // Prompt if module is not provided
        },
      ]);

      // Use provided arguments or answers from prompts
      project = project || answers.project;
      module = module || answers.module;
    }

    const fullCommand = commandName.join(" "); // Combine all extra arguments into a single string
    const projectData = await updateProject(project, module);

    try {
      const response = await runCommand({
        command: fullCommand,
        module: module,
      });

      // Check if the request was successful and save the JSON data to a file
      if (response) {
        if (fullCommand.includes("make")) {
          // Define the directory to watch and the API endpoint to upload to
          const watchDirectory = `./projects/${projectData[project].dir_name}/${projectData[project]["modules"][module].dir_name}`; // Change this to your desired directory

          const getManifestFiles = await manifestFile({
            module: module,
          });

          const watchDirectoryFilesData = await getAllFiles(watchDirectory);

          const ignoredExtensions = [".gitkeep", ".ignore", ".temp"]; // Add your desired extensions here

          const watchDirectoryFiles = watchDirectoryFilesData.filter((file) => {
            const extension = file.substr(file.lastIndexOf("."));
            return !ignoredExtensions.includes(extension);
          });

          const watchDirectoryFilesNormalized = watchDirectoryFiles.map(
            (file) => {
              return file.replace(/\\/g, "/").replace(/\/+/g, "/");
            }
          );

          // Check if getManifestFiles contains data
          if (getManifestFiles["file_manifest"].length > 0) {
            // Iterate over each file in the manifest
            for (const manifestFile of getManifestFiles["file_manifest"]) {
              const location = "projects/" + manifestFile["location"];
              const normalizedLocation = location
                .replace(/\\/g, "/")
                .replace(/\/+/g, "/");

              // Check if the file's location exists in the watch directory
              if (!watchDirectoryFilesNormalized.includes(normalizedLocation)) {
                const response = await downloadFile({
                  directory: normalizedLocation, // Include directory name in the payload
                });
                const fileData = Buffer.from(response.content, "base64");

                // Ensure that the directory structure leading up to the file exists
                await mkdir(dirname(location), { recursive: true });

                // Write the file to the local filesystem
                await writeFile(location, fileData);
              }
            }
          }
        }
        console.log(response.output);
      } else {
        console.error("Error running command.");
      }
    } catch (error) {
      handleErrorMessage(error);
    }

    async function runCommand(payload) {
      try {
        const response = await postModuleApp(
          `${projectData[project].dev_url}/api/v1/command/${project}`,
          payload,
          projectData[project].access_key
        );

        if (response.data && response.status === "success") {
          return response.data;
        } else {
          console.error(`${response.message}`);
        }
      } catch (error) {
        handleErrorMessage(error);
      }
    }

    async function manifestFile(payload) {
      try {
        const response = await postModuleApp(
          `${projectData[project].dev_url}/api/v1/manifest/${project}`,
          payload,
          projectData[project].access_key
        );

        if (response.data && response.status === "success") {
          return response.data;
        } else {
          console.error(`${response.message}`);
        }
      } catch (error) {
        handleErrorMessage(error);
      }
    }

    async function downloadFile(payload) {
      try {
        const response = await postModuleAppDownload(
          `${projectData[project].dev_url}/api/v1/download/${project}`,
          payload,
          projectData[project].access_key
        );
        const responseFile = JSON.parse(new TextDecoder().decode(response));

        if (responseFile.data && responseFile.status === "success") {
          return responseFile.data;
        } else {
          console.error(`${response.message}`);
        }
      } catch (error) {
        handleErrorMessage(error);
      }
    }
  });

// Export passCommand as the default export
export default passCommand;
