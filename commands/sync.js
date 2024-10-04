import { program } from "commander";
import {
  postModuleApp,
  updateProject,
  postModuleAppDownload,
  getAllFiles,
  getFileHash,
  handleErrorMessage,
} from "../app/utils.js";
import { readdir, stat, readFile, writeFile, mkdir } from "fs/promises";
import { join, basename, dirname } from "path";

const syncCommand = program
  .command("sync <project> <module>")
  .description("Watch projects for changes and upload them")
  .action(async (project, module) => {
    const projectData = await updateProject(project, module);

    // Define the directory to watch and the API endpoint to upload to
    const watchDirectory = `./projects/${projectData[project].dir_name}/${projectData[project]["modules"][module].dir_name}`; // Change this to your desired directory

    const getManifestFiles = await manifestFile({
      module: module,
    });
    const watchDirectoryFilesData = await getAllFiles(watchDirectory);
    const ignoredExtensions = [".gitkeep", ".ignore", ".gitignore", ".temp"]; // Add your desired extensions here

    const watchDirectoryFiles = watchDirectoryFilesData.filter((file) => {
      const extension = file.substr(file.lastIndexOf("."));
      return !ignoredExtensions.includes(extension);
    });

    const watchDirectoryFilesNormalized = watchDirectoryFiles.map((file) => {
      return file.replace(/\\/g, "/").replace(/\/+/g, "/");
    });

    // Check if getManifestFiles contains data
    if (getManifestFiles && getManifestFiles["file_manifest"].length > 0) {
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

          // // Ensure that the directory structure leading up to the file exists
          await mkdir(dirname(normalizedLocation), { recursive: true });

          // // Write the file to the local filesystem
          await writeFile(normalizedLocation, fileData);
          console.log(`Sync File ${normalizedLocation} has been downloaded.`);
        }
      }
    }

    // Iterate over each file in the watch directory
    for (const watchDirectoryFile of watchDirectoryFilesNormalized) {
      // Construct the manifest location from the watch directory file path
      const manifestLocation = watchDirectoryFile.replace("projects/", "");
      const fileHash = await getFileHash(watchDirectoryFile);
      // Find the corresponding entry in the manifest file
      const manifestEntry = getManifestFiles["file_manifest"].find(
        (file) => file["location"] === manifestLocation
      );
      // console.log(watchDirectoryFile, manifestEntry["hash"], fileHash);
      // Check if the file's location exists in the manifest
      if (
        !manifestEntry ||
        (manifestEntry && manifestEntry["hash"] !== fileHash)
      ) {
        try {
          const fileContent = await readFile(watchDirectoryFile);

          const fileName = basename(watchDirectoryFile);
          const fileDir = dirname(watchDirectoryFile); // Get the directory name

          const fileContentBase64 = Buffer.from(fileContent).toString("base64");

          await uploadFile({
            file_name: fileName,
            file_path: watchDirectoryFile,
            content: fileContentBase64,
            directory: fileDir, // Include directory name in the payload
            action_type: "update",
            last_modified: (await stat(watchDirectoryFile)).mtime,
          });
          console.log(`Sync File ${manifestLocation} has been updated.`);
        } catch (error) {
          handleErrorMessage(error);
        }
      }
    }

    async function uploadFile(payload) {
      try {
        const response = await postModuleApp(
          `${projectData[project].dev_url}/api/v1/watch/${project}`,
          payload,
          projectData[project].access_key
        );
        // console.log(
        //   `Uploaded ${payload.file_path} successfully for ${project}`
        // );
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

    console.log(`Syncing directory: ${watchDirectory} for ${project} project.`);
  });

export default syncCommand;
