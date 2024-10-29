import { Command } from "commander";
import { exec } from "child_process";
import inquirer from "inquirer";
import {
  postModuleApp,
  updateProject,
  handleErrorMessage,
  getProject,
} from "../app/utils.js";
import chokidar from "chokidar";
import { readFile, stat } from "fs/promises";
import { basename, dirname } from "path"; // Import dirname function to get the directory name

const watchCommand = new Command("watch")
  .argument("[project]", "Project name to sync")
  .argument("[module]", "Module name to sync with project")
  .description(
    "Watch projects for changes and upload them for a specific project"
  )
  .action(async (project, module = null) => {
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

    const projectData = await updateProject(project);
    const watchDirectory = `./projects/${projectData[project].dir_name}`; // Set the directory based on the project name
    if (module) {
      exec(`sylloo sync ${project} ${module}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing command: ${error.message}`);
          return;
        }
        if (stderr) {
          console.error(`Command stderr: ${stderr}`);
          return;
        }
        console.log(stdout);
        // Start the watcher after the sync command has finished
        startWatcher();
      });
    } else {
      // If module is not provided, start the watcher directly
      startWatcher();
    }

    function startWatcher() {
      const watcher = chokidar.watch(watchDirectory, {
        ignoreInitial: true,
        ignored: /(^|[/\\])\../, // Ignore dotfiles
      });

      watcher.on("ready", () => {
        console.log(
          `Watching directory for ${projectData[project].name}: ${watchDirectory}`
        );
      });

      watcher.on("add", async (filePath) => {
        await handleFileEvent(filePath, "create");
        console.log(`Watch File ${filePath} has been added.`);
      });

      watcher.on("change", async (filePath) => {
        await handleFileEvent(filePath, "update");
        console.log(`Watch File ${filePath} has been changed.`);
      });

      watcher.on("unlink", async (filePath) => {
        await handleDirectoryEvent(filePath, "delete");
        console.log(`Watch File ${filePath} has been removed.`);
      });

      watcher.on("addDir", async (dirPath) => {
        await handleDirectoryEvent(dirPath, "create-dir");
        console.log(`Watch Directory ${dirPath} has been created.`);
      });

      watcher.on("unlinkDir", async (dirPath) => {
        await handleDirectoryEvent(dirPath, "delete-dir");
        console.log(`Watch Directory ${dirPath} has been removed.`);
      });
    }

    async function handleFileEvent(filePath, actionType) {
      try {
        const fileContent = await readFile(filePath);
        const fileName = basename(filePath);
        const fileDir = dirname(filePath); // Get the directory name
        const fileContentBase64 = Buffer.from(fileContent).toString("base64");

        await uploadFile({
          file_name: fileName,
          file_path: filePath,
          content: fileContentBase64,
          directory: fileDir, // Include directory name in the payload
          action_type: actionType,
          last_modified: (await stat(filePath)).mtime,
        });
      } catch (error) {
        handleErrorMessage(error);
      }
    }

    async function handleDirectoryEvent(dirPath, actionType) {
      try {
        await uploadFile({
          file_name: "", // Empty file name for directories
          file_path: "",
          content: "", // Empty content for directories
          directory: dirPath, // Empty directory name for directories
          action_type: actionType,
          last_modified: "",
        });

        console.log(`Handled directory event (${actionType}): ${dirPath}`);
      } catch (error) {
        handleErrorMessage(error);
      }
    }

    async function uploadFile(payload) {
      const projectLockData = await getProject(project);
      try {
        const response = await postModuleApp(
          `${projectLockData[project].dev_url}/api/v1/watch/${project}`,
          payload,
          projectLockData[project].access_key
        );
      } catch (error) {
        handleErrorMessage(error);
      }
    }
  });

export default watchCommand;
