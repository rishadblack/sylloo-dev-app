import { readdir, stat, readFile, writeFile, access, mkdir } from "fs/promises";
import md5File from "md5-file";
import axios from "axios";
import { join, basename, dirname } from "path";
import https from "https";

// Function to read a JSON file and extract the specified property
async function setSession(data) {
  try {
    // Read the contents of the file
    await writeFile("session-lock.json", JSON.stringify(data, null, 2));
  } catch (error) {
    handleErrorMessage(error);
  }
}

// Function to read a JSON file and extract the specified property
async function updateProject(ProjectSlug = null, ModuleSlug = null) {
  try {
    const response = await postWithToken("v1/user/projects", {
      project: ProjectSlug,
    });
    // Read the contents of the file
    await writeFile(
      "project-lock.json",
      JSON.stringify(response.data, null, 2)
    );
    if (response.status) {
      // Assuming response.data is your array of project objects
      for (const project of response.data) {
        const projectKey = Object.keys(project)[0]; // Get the project slug
        // Get the modules object for the current project
        const modules = project[projectKey].modules;
        // Loop through each module in the modules object
        for (const moduleName in modules) {
          if (modules.hasOwnProperty(moduleName)) {
            // Access each module
            const module = modules[moduleName];
            const watchDirectory = `./projects/${project[projectKey].dir_name}/${module.dir_name}`;
            // Check if the directory exists
            try {
              // Check if the directory exists
              await access(watchDirectory);
            } catch (error) {
              // If it doesn't exist, create it
              await mkdir(watchDirectory, { recursive: true });
              console.log(`Directory created: ${watchDirectory}`);
            }
          }
        }
      }
    }

    if (ProjectSlug === null) return response.data;

    const projectTwoData = response.data.find((project) =>
      project.hasOwnProperty(ProjectSlug)
    );

    if (!projectTwoData) {
      return handleErrorMessage(
        `You have no access for : ${ProjectSlug} Project`
      );
    }

    if (
      ModuleSlug &&
      !projectTwoData[ProjectSlug].modules.hasOwnProperty(ModuleSlug)
    ) {
      handleErrorMessage(`You have no access for : ${ModuleSlug} Project`);
    }

    return projectTwoData;
  } catch (error) {
    handleErrorMessage(error);
  }
}

async function modifyProject(modifications) {
  try {
    // Read the contents of the project-lock.json file
    const jsonContent = await readFile("project-lock.json", "utf-8");

    // Parse the JSON content into a JavaScript object
    const projectData = JSON.parse(jsonContent);

    // Make modifications to the project data as needed
    // Example: Add or update properties
    // modifications should be an object with keys as project slugs and values as the modifications
    Object.entries(modifications).forEach(([projectSlug, modifiedData]) => {
      const projectIndex = projectData.findIndex((project) =>
        project.hasOwnProperty(projectSlug)
      );
      if (projectIndex !== -1) {
        projectData[projectIndex][projectSlug] = {
          ...projectData[projectIndex][projectSlug],
          ...modifiedData,
        };
      }
    });

    // Convert the modified object back to a JSON string
    const updatedJsonContent = JSON.stringify(projectData, null, 2);

    // Write the updated JSON content back to the project-lock.json file
    await writeFile("project-lock.json", updatedJsonContent);

    console.log("project-lock.json file updated successfully.");
  } catch (error) {
    handleErrorMessage(error);
  }
}

// Function to read a JSON file and extract the specified property
async function getProject(ProjectSlug = null) {
  try {
    // Read the contents of the file
    const fileContent = await readFile("project-lock.json", "utf-8");

    // Parse the JSON content into an object
    const jsonData = JSON.parse(fileContent);

    if (ProjectSlug === null) return jsonData;

    const projectTwoData = jsonData.find((project) =>
      project.hasOwnProperty(ProjectSlug)
    );

    // Extract the specified property
    return projectTwoData;
  } catch (error) {
    handleErrorMessage(error);
  }
}

// Function to read a JSON file and extract the specified property
async function getUser() {
  try {
    // Read the contents of the file
    const fileContent = await readFile("session-lock.json", "utf-8");

    // Parse the JSON content into an object
    const jsonData = JSON.parse(fileContent);

    // Extract the specified property
    return jsonData["user"];
  } catch (error) {
    handleErrorMessage(error);
  }
}

// Function to read a JSON file and extract the name property
async function getBearerToken() {
  try {
    // Read the contents of the file
    const fileContent = await readFile("session-lock.json", "utf-8");

    // Parse the JSON content into an object
    const jsonData = JSON.parse(fileContent);

    // Extract the specified property
    return jsonData["authorization"]["token"];
  } catch (error) {
    handleErrorMessage(error);
  }
}

async function postWithToken(url, data = {}) {
  const httpsAgent = new https.Agent({
    rejectUnauthorized: false, // Disable SSL verification
  });

  try {
    const response = await axios.post(
      `${process.env.BASE_URL}/api/${url}`,
      data,
      {
        headers: {
          Authorization: `Bearer ${await getBearerToken()}`,
        },
        httpsAgent,
      }
    );
    return response.data;
  } catch (error) {
    handleErrorMessage(error);
  }
}

async function postModuleApp(url, data = {}, token = "", web_key = "") {
  try {
    const response = await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        web_key: web_key,
      },
    });
    return response.data;
  } catch (error) {
    handleErrorMessage(error);
  }
}

async function postModuleAppDownload(url, data = {}, token = "", web_key = "") {
  try {
    const response = await axios.post(`${url}`, data, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        web_key: web_key,
      },
      responseType: "arraybuffer",
    });
    return response.data;
  } catch (error) {
    const responseData = JSON.parse(
      new TextDecoder().decode(error.response.data)
    );

    if (responseData.status === "error") {
      handleErrorMessage(responseData.message);
    } else {
      handleErrorMessage(error);
    }
  }
}

function filterFilesByExtension(files, extensions) {
  return files.filter((file) => {
    const fileExtension = file.split(".").pop(); // Get the file extension
    return !extensions.includes(fileExtension); // Check if the extension is not in the list
  });
}

// Recursive function to get all files in a directory and its subdirectories
async function getAllFiles(directory, ignoreFolders = [".git"]) {
  let files = [];

  // Read the contents of the directory
  const entries = await readdir(directory);

  // Iterate over the entries in the directory
  for (const entry of entries) {
    // Get the full path of the entry
    const fullPath = join(directory, entry);

    // Get the stats of the entry
    const stats = await stat(fullPath);

    // Check if the entry is a directory
    if (stats.isDirectory()) {
      // Check if the directory should be ignored
      if (ignoreFolders.includes(entry)) {
        continue; // Skip this directory
      }

      // Recursively get files in the subdirectory
      const subDirectoryFiles = await getAllFiles(fullPath, ignoreFolders);
      files = files.concat(subDirectoryFiles);
    } else {
      // If the entry is a file, add it to the list of files
      files.push(fullPath);
    }
  }

  return files;
}

async function getFileHash(filePath) {
  // Calculate and return the MD5 hash of the file content
  const fileHash = await md5File(filePath);
  return fileHash;
}

function handleErrorMessage(error) {
  if (
    error.response &&
    error.response.data &&
    error.response.data.status === "error"
  ) {
    console.error(error.response.data.errors);
    console.error(error.response.data.message);
    process.exit(1);
  } else if (error.message) {
    console.log(error);
    console.error("Error:", error.message);
    throw error.message;
  } else if (error) {
    console.error(error);
    process.exit(1);
  } else {
    console.error("Unknown error occurred.");
    throw error;
  }
}

// Export the functions
export {
  setSession,
  updateProject,
  getProject,
  getUser,
  getBearerToken,
  postWithToken,
  postModuleApp,
  filterFilesByExtension,
  postModuleAppDownload,
  getAllFiles,
  getFileHash,
  modifyProject,
  handleErrorMessage,
};
